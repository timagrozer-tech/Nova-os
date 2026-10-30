package com.droidvm.app

import android.content.Context
import java.io.File
import java.io.IOException
import java.io.InputStream
import java.io.RandomAccessFile
import java.net.HttpURLConnection
import java.net.URL
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.atomic.AtomicBoolean
import java.util.zip.GZIPInputStream
import java.util.zip.ZipInputStream

/**
 * Установка GSI (универсальной прошивки Android) поверх основы DroidVM OS.
 *
 * Каждая GSI получает свою машину:
 *  - диск 1 — копия-при-записи (qcow2 overlay) общей основы DroidVM OS: ядро, vendor, загрузчик;
 *    служебные разделы misc/metadata/cache очищаются, чтобы система стартовала «с нуля»;
 *  - диск 2 — новый пустой диск данных 16 ГБ;
 *  - диск 3 — сама GSI (system.img → qcow2). Основа DroidVM OS загружает систему с третьего диска.
 */
object GsiInstaller {

    class Step(val p: Int, val text: String)

    private fun gsiDir(ctx: Context) = File(VmStore.imagesDir(ctx), "GSI").apply { mkdirs() }

    /** Основа — последняя скачанная DroidVM OS. */
    private fun baseVda(ctx: Context): Pair<File, String> {
        val v = OsInstaller.installedVersions(ctx).firstOrNull()
            ?: throw IOException("Сначала установите DroidVM OS: GSI использует её ядро и драйверы.")
        val dir = File(VmStore.imagesDir(ctx), "DroidVM-OS-$v")
        val f = listOf("droidvm-os-vda.qcow2", "vda.qcow2").map { File(dir, it) }.first { it.exists() }
        return f to v
    }

    // ---------------- скачивание ----------------

    private fun probe(url: String): Pair<Long, Boolean> {
        val c = URL(url).openConnection() as HttpURLConnection
        c.instanceFollowRedirects = true; c.connectTimeout = 20_000; c.readTimeout = 30_000
        c.setRequestProperty("User-Agent", "DroidVM")
        c.setRequestProperty("Range", "bytes=0-0")
        val code = c.responseCode
        val total = c.getHeaderField("Content-Range")?.substringAfter('/')?.toLongOrNull()
        val len = c.contentLengthLong
        c.disconnect()
        return when {
            code == 206 && total != null -> total to true
            code == 200 && len > 0 -> len to false
            else -> throw IOException("Сервер ответил $code")
        }
    }

    fun download(ctx: Context, r: GsiCatalog.Resolved, cancelled: AtomicBoolean, progress: (Int, String) -> Unit): File {
        val (size, ranges) = probe(r.url)
        val dest = File(gsiDir(ctx), r.fileName)
        val free = gsiDir(ctx).usableSpace
        // архив + распакованный образ + qcow2 — с запасом
        if (free < size * 4 + (1L shl 30)) throw IOException("Нужно около ${humanSize(size * 4 + (1L shl 30))} свободного места, есть ${humanSize(free)}")
        val d = Downloader(r.url, size, dest, if (ranges) 6 else 1, cancelled)
        val t0 = System.currentTimeMillis()
        val w = Thread {
            while (!Thread.currentThread().isInterrupted) {
                val got = d.done.get(); val sec = (System.currentTimeMillis() - t0) / 1000.0
                val sp = if (sec > 1) got / sec else 0.0
                progress((got * 100 / size).toInt(), "Скачивание: ${humanSize(got)} из ${humanSize(size)} · ${humanSize(sp.toLong())}/с")
                try { Thread.sleep(400) } catch (e: InterruptedException) { break }
            }
        }.apply { start() }
        try { d.run() } finally { w.interrupt() }
        return dest
    }

    // ---------------- распаковка ----------------

    private fun copyWithProgress(inp: InputStream, out: File, total: Long, cancelled: AtomicBoolean, progress: (Int, String) -> Unit) {
        out.outputStream().buffered(1 shl 20).use { o ->
            val buf = ByteArray(1 shl 20); var done = 0L; var last = 0L
            while (true) {
                if (cancelled.get()) throw InterruptedException("Отменено")
                val n = inp.read(buf); if (n < 0) break
                o.write(buf, 0, n); done += n
                val now = System.currentTimeMillis()
                if (now - last > 400) { last = now; progress(if (total > 0) (done * 100 / total).toInt() else -1, "Распаковка: ${humanSize(done)}") }
            }
        }
    }

    /** Достать system.img из архива любого поддерживаемого формата. */
    fun extract(env: QemuEnv, archive: File, out: File, cancelled: AtomicBoolean, progress: (Int, String) -> Unit) {
        val n = archive.name.lowercase()
        out.delete()
        when {
            n.endsWith(".zip") -> ZipInputStream(archive.inputStream().buffered(1 shl 20)).use { z ->
                var best: String? = null
                // сначала ищем system.img, иначе самый первый .img
                while (true) {
                    val e = z.nextEntry ?: break
                    val en = e.name.substringAfterLast('/').lowercase()
                    if (en == "system.img" || (best == null && en.endsWith(".img") && !en.startsWith("vbmeta"))) {
                        copyWithProgress(z, out, e.size, cancelled, progress)
                        best = en
                        if (en == "system.img") break
                    }
                }
                if (best == null) throw IOException("В zip нет образа .img")
            }
            n.endsWith(".gz") -> GZIPInputStream(archive.inputStream().buffered(1 shl 20), 1 shl 16).use {
                copyWithProgress(it, out, -1, cancelled, progress)
            }
            n.endsWith(".xz") -> {
                if (!env.xz.exists()) throw IOException("В эту сборку приложения не встроен xz — распакуйте файл на компьютере")
                progress(-1, "Распаковка .xz…")
                val watcher = Thread {
                    while (!Thread.currentThread().isInterrupted) {
                        progress(-1, "Распаковка: ${humanSize(out.length())}")
                        try { Thread.sleep(500) } catch (e: InterruptedException) { break }
                    }
                }.apply { start() }
                val (code, msg) = try { env.run(env.xz.absolutePath, "-dc", "-T0", archive.absolutePath, outFile = out) } finally { watcher.interrupt() }
                if (code != 0) throw IOException("xz: $msg")
            }
            n.endsWith(".7z") -> {
                if (!env.sevenZip.exists()) throw IOException("В эту сборку приложения не встроен 7-Zip — распакуйте файл на компьютере")
                val (_, list) = env.run(env.sevenZip.absolutePath, "l", "-slt", archive.absolutePath)
                val paths = Regex("^Path = (.+)$", RegexOption.MULTILINE).findAll(list).map { it.groupValues[1].trim() }
                    .filter { it.lowercase().endsWith(".img") }.toList()
                val inner = paths.firstOrNull { it.substringAfterLast('/').equals("system.img", true) } ?: paths.firstOrNull()
                    ?: throw IOException("В 7z нет образа .img")
                progress(-1, "Распаковка .7z…")
                val (code, msg) = env.run(env.sevenZip.absolutePath, "e", "-so", archive.absolutePath, inner, outFile = out)
                if (code != 0) throw IOException("7z: $msg")
            }
            n.endsWith(".img") -> if (!archive.renameTo(out)) archive.copyTo(out, overwrite = true)
            else -> throw IOException("Неизвестный формат: ${archive.name}. Подходят .img, .img.xz, .img.gz, .zip, .7z")
        }
        if (!out.exists() || out.length() < (64L shl 20)) throw IOException("Образ системы не получен (слишком маленький файл)")
    }

    /** Android sparse image → обычный образ (если нужно). */
    fun unsparseIfNeeded(img: File, progress: (Int, String) -> Unit) {
        val head = ByteArray(28)
        img.inputStream().use { it.read(head) }
        val bb = ByteBuffer.wrap(head).order(ByteOrder.LITTLE_ENDIAN)
        if (bb.getInt(0) != 0xED26FF3A.toInt()) return
        progress(-1, "Преобразую sparse-образ…")
        val fileHdr = bb.getShort(8).toInt() and 0xffff
        val chunkHdr = bb.getShort(10).toInt() and 0xffff
        val blk = bb.getInt(12).toLong()
        val totalBlocks = bb.getInt(16).toLong()
        val chunks = bb.getInt(20)
        val raw = File(img.path + ".raw")
        RandomAccessFile(raw, "rw").use { out ->
            out.setLength(blk * totalBlocks)
            img.inputStream().buffered(1 shl 20).use { inp ->
                inp.skip(fileHdr.toLong())
                val ch = ByteArray(chunkHdr); var pos = 0L
                val buf = ByteArray(1 shl 20)
                for (i in 0 until chunks) {
                    readFully(inp, ch)
                    val c = ByteBuffer.wrap(ch).order(ByteOrder.LITTLE_ENDIAN)
                    val type = c.getShort(0).toInt() and 0xffff
                    val nblk = c.getInt(4).toLong() and 0xffffffffL
                    val dataLen = (c.getInt(8).toLong() and 0xffffffffL) - chunkHdr
                    when (type) {
                        0xCAC1 -> { // RAW
                            out.seek(pos); var left = dataLen
                            while (left > 0) { val k = inp.read(buf, 0, minOf(buf.size.toLong(), left).toInt()); if (k < 0) throw IOException("обрыв sparse"); out.write(buf, 0, k); left -= k }
                        }
                        0xCAC2 -> { // FILL
                            val v = ByteArray(4); readFully(inp, v)
                            if (v.any { it.toInt() != 0 }) {
                                val pattern = ByteArray(1 shl 16) { v[it % 4] }
                                out.seek(pos); var left = nblk * blk
                                while (left > 0) { val k = minOf(pattern.size.toLong(), left).toInt(); out.write(pattern, 0, k); left -= k }
                            }
                        }
                        0xCAC3 -> {} // DONT_CARE — дырка
                        0xCAC4 -> inp.skip(dataLen) // CRC32
                        else -> throw IOException("Неизвестный тип блока sparse: $type")
                    }
                    pos += nblk * blk
                    if (i % 64 == 0) progress((i * 100L / chunks).toInt(), "Преобразую sparse-образ…")
                }
            }
        }
        img.delete(); raw.renameTo(img)
    }

    private fun readFully(inp: InputStream, b: ByteArray) {
        var o = 0
        while (o < b.size) { val n = inp.read(b, o, b.size - o); if (n < 0) throw IOException("обрыв файла"); o += n }
    }

    // ---------------- создание машины ----------------

    private fun qimg(env: QemuEnv, vararg a: String, onLine: ((String) -> Unit)? = null) {
        val (code, out) = env.run(env.qemuImg.absolutePath, *a, onLine = onLine)
        if (code != 0) throw IOException("qemu-img: ${out.trim().lines().lastOrNull() ?: code}")
    }

    /** Очистить служебные разделы (misc, metadata, cache) в overlay, чтобы GSI стартовала с чистыми данными. */
    private fun wipeService(env: QemuEnv, vda: File) {
        if (!env.qemuIo.exists()) return
        val gpt = File(vda.parentFile, "gpt.bin"); gpt.delete()
        env.run(env.qemuImg.absolutePath, "dd", "if=${vda.absolutePath}", "of=${gpt.absolutePath}", "bs=512", "count=34")
        if (!gpt.exists()) return
        val b = ByteBuffer.wrap(gpt.readBytes()).order(ByteOrder.LITTLE_ENDIAN)
        gpt.delete()
        if (b.capacity() < 34 * 512 || String(b.array(), 512, 8) != "EFI PART") return
        val entLba = b.getLong(512 + 72); val n = b.getInt(512 + 80); val sz = b.getInt(512 + 84)
        for (i in 0 until minOf(n, 128)) {
            val off = (entLba * 512 + i.toLong() * sz).toInt()
            if (off + sz > b.capacity()) break
            val first = b.getLong(off + 32); val last = b.getLong(off + 40)
            val name = String(b.array(), off + 56, 72, Charsets.UTF_16LE).trimEnd('\u0000')
            if (first > 0 && name in setOf("misc", "metadata", "cache")) {
                env.run(env.qemuIo.absolutePath, "-f", "qcow2", "-c", "write -z ${first * 512} ${(last - first + 1) * 512}", vda.absolutePath)
            }
        }
    }

    /**
     * Полная установка: (скачать) → распаковать → qcow2 → новая машина.
     * [archive] — уже скачанный или импортированный файл.
     */
    fun install(ctx: Context, title: String, archive: File, deleteArchive: Boolean, cancelled: AtomicBoolean,
                progress: (Int, String) -> Unit): VmConfig {
        val env = QemuEnv(ctx.applicationContext)
        val (base, baseVer) = baseVda(ctx)
        val slug = archive.name.substringBefore('.').replace(Regex("[^A-Za-z0-9._-]"), "_").take(80)
        val img = File(gsiDir(ctx), "$slug.img")
        val gsiQcow = File(gsiDir(ctx), "$slug.qcow2")

        if (!gsiQcow.exists()) {
            extract(env, archive, img, cancelled, progress)
            if (deleteArchive && archive.exists() && archive != img) archive.delete()
            unsparseIfNeeded(img, progress)
            progress(0, "Подготовка образа системы…")
            val tmp = File(gsiQcow.path + ".part")
            qimg(env, "convert", "-p", "-O", "qcow2", img.absolutePath, tmp.absolutePath) { line ->
                Regex("\\((\\d+(?:\\.\\d+)?)/100%\\)").find(line)?.let { progress(it.groupValues[1].toFloat().toInt(), "Подготовка образа системы…") }
            }
            tmp.renameTo(gsiQcow); img.delete()
        } else if (deleteArchive) archive.delete()

        // Общая неизменяемая копия основы — от неё делаются overlay всех GSI-машин
        val baseDir = File(gsiDir(ctx), "base").apply { mkdirs() }
        val baseCopy = File(baseDir, "droidvm-os-$baseVer-vda.qcow2")
        if (!baseCopy.exists()) {
            progress(-1, "Копирую основу DroidVM OS $baseVer…")
            val tmp = File(baseCopy.path + ".part")
            base.copyTo(tmp, overwrite = true); tmp.renameTo(baseCopy)
            baseCopy.setReadOnly()
        }

        progress(-1, "Создаю машину…")
        val cfg = VmConfig(
            name = title, arch = VmConfig.ARCH_ARM, bootMode = VmConfig.BOOT_UEFI,
            diskIface = "virtio", gpu = "virtio", input = "usb", net = "virtio", adbPort = 5555,
            resolution = "720x1280", density = 320, multiThread = true,
        )
        val am = ctx.getSystemService(android.app.ActivityManager::class.java)
        val totalMb = (android.app.ActivityManager.MemoryInfo().also { am.getMemoryInfo(it) }.totalMem / 1048576).toInt()
        cfg.ramMb = minOf(3072, totalMb / 2 / 256 * 256).coerceAtLeast(2048)
        cfg.cpus = Runtime.getRuntime().availableProcessors().coerceIn(2, 4)
        cfg.tbSizeMb = if (totalMb >= 7000) 1024 else 512
        val vmDir = VmStore.vmDir(ctx, cfg.id)
        val vda = File(vmDir, "vda.qcow2"); val vdb = File(vmDir, "vdb.qcow2")
        try {
            qimg(env, "create", "-f", "qcow2", "-b", baseCopy.absolutePath, "-F", "qcow2", vda.absolutePath)
            wipeService(env, vda)
            qimg(env, "create", "-f", "qcow2", vdb.absolutePath, "16G")
        } catch (e: Throwable) { vmDir.deleteRecursively(); throw e }
        cfg.disks = mutableListOf(vda.absolutePath, vdb.absolutePath, gsiQcow.absolutePath)
        VmStore.save(ctx, cfg)
        return cfg
    }
}
