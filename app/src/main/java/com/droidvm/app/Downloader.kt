package com.droidvm.app

import java.io.File
import java.io.IOException
import java.io.RandomAccessFile
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong

/**
 * Многопоточная загрузка большого файла с докачкой.
 * Файл делится на части, каждая качается своим соединением (HTTP Range) прямо в нужное место
 * итогового файла — без распаковки и копирования. Прогресс частей хранится рядом (.chunks),
 * поэтому после обрыва связи или перезапуска загрузка продолжается с того же места.
 */
class Downloader(
    private val url: String,
    private val size: Long,
    private val dest: File,
    private val threads: Int,
    private val cancelled: AtomicBoolean,
) {
    private val part = File(dest.path + ".part")
    private val meta = File(dest.path + ".chunks")
    private lateinit var starts: LongArray
    private lateinit var ends: LongArray
    private lateinit var pos: LongArray
    val done = AtomicLong(0)
    @Volatile private var resolved: String? = null

    private fun open(u: String, from: Long, to: Long): HttpURLConnection {
        val c = URL(u).openConnection() as HttpURLConnection
        c.connectTimeout = 20_000; c.readTimeout = 45_000
        c.instanceFollowRedirects = true
        c.setRequestProperty("User-Agent", "DroidVM")
        c.setRequestProperty("Range", "bytes=$from-$to")
        return c
    }

    /** Получить прямую ссылку на CDN один раз (GitHub отдаёт редирект на подписанный адрес). */
    private fun resolve(force: Boolean = false): String {
        resolved?.takeIf { !force }?.let { return it }
        val c = open(url, 0, 0)
        c.responseCode
        val u = c.url.toString()
        c.disconnect()
        resolved = u
        return u
    }

    private fun plan() {
        val n = if (size < 64L shl 20) 1 else threads
        val step = (size + n - 1) / n
        starts = LongArray(n) { it * step }
        ends = LongArray(n) { minOf(size - 1, (it + 1) * step - 1) }
        pos = starts.copyOf()
        if (part.exists() && part.length() == size && meta.exists()) {
            runCatching {
                val a = meta.readText().trim().split(',').map { it.trim().toLong() }
                if (a.size == n) for (i in 0 until n) pos[i] = a[i].coerceIn(starts[i], ends[i] + 1)
            }
        } else {
            part.delete(); meta.delete()
            RandomAccessFile(part, "rw").use { it.setLength(size) }
        }
        done.set((0 until n).sumOf { pos[it] - starts[it] })
    }

    @Synchronized private fun saveMeta() {
        meta.writeText(pos.joinToString(","))
    }

    private fun worker(i: Int): Throwable? {
        var attempts = 0
        val buf = ByteArray(1 shl 17)
        RandomAccessFile(part, "rw").use { raf ->
            while (pos[i] <= ends[i]) {
                if (cancelled.get()) return InterruptedException("Отменено")
                try {
                    val c = open(resolve(attempts > 1), pos[i], ends[i])
                    val code = c.responseCode
                    if (code == 403 || code == 410) { resolve(true); throw IOException("Ссылка устарела ($code)") }
                    if (code != 206 && !(code == 200 && starts.size == 1 && pos[i] == 0L)) throw IOException("HTTP $code")
                    raf.seek(pos[i])
                    var sinceSave = 0L
                    c.inputStream.use { inp ->
                        while (pos[i] <= ends[i]) {
                            if (cancelled.get()) return InterruptedException("Отменено")
                            val want = minOf(buf.size.toLong(), ends[i] - pos[i] + 1).toInt()
                            val n = inp.read(buf, 0, want)
                            if (n < 0) break
                            raf.write(buf, 0, n)
                            pos[i] += n; done.addAndGet(n.toLong()); sinceSave += n
                            if (sinceSave > (8L shl 20)) { saveMeta(); sinceSave = 0 }
                        }
                    }
                    c.disconnect()
                    saveMeta()
                    attempts = 0
                } catch (e: IOException) {
                    saveMeta()
                    if (++attempts > 8) return e
                    Thread.sleep(minOf(30_000L, 1000L * attempts * attempts))
                }
            }
        }
        return null
    }

    /** Блокирует до завершения. Бросает исключение при ошибке или отмене. */
    fun run() {
        if (dest.exists() && dest.length() == size) { done.set(size); return }
        plan()
        val errors = arrayOfNulls<Throwable>(starts.size)
        val ts = starts.indices.map { i -> Thread({ errors[i] = worker(i) }, "dl-$i").apply { start() } }
        ts.forEach { it.join() }
        errors.firstOrNull { it != null }?.let { throw it }
        if (part.length() != size) throw IOException("Размер файла не совпал")
        meta.delete()
        dest.delete()
        if (!part.renameTo(dest)) throw IOException("Не удалось сохранить ${dest.name}")
    }
}
