package com.droidvm.app

import android.app.ActivityManager
import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.atomic.AtomicBoolean
import java.util.zip.ZipInputStream

/**
 * Установка «DroidVM OS» — нашей прошивки (LineageOS для QEMU + Magisk) из GitHub Releases.
 * Образ скачивается и распаковывается потоком, сразу в папку образов, затем создаётся ВМ.
 */
object OsInstaller {

    const val REPO = "timagrozer-tech/Nova-os"
    private const val TAG_PREFIX = "droidvm-os-"
    private const val ASSET = "droidvm-os-arm64.zip"

    data class Release(val tag: String, val url: String, val size: Long)

    private fun open(url: String): HttpURLConnection {
        val c = URL(url).openConnection() as HttpURLConnection
        c.connectTimeout = 20_000
        c.readTimeout = 60_000
        c.instanceFollowRedirects = true
        c.setRequestProperty("User-Agent", "DroidVM")
        c.setRequestProperty("Accept", "application/vnd.github+json, */*")
        return c
    }

    /** Найти последний релиз прошивки. Вызывать в фоне. */
    fun latest(): Release {
        val c = open("https://api.github.com/repos/$REPO/releases?per_page=30")
        if (c.responseCode != 200) throw IOException("GitHub ответил ${c.responseCode}")
        val arr = JSONArray(c.inputStream.bufferedReader().readText())
        for (i in 0 until arr.length()) {
            val r = arr.getJSONObject(i)
            val tag = r.optString("tag_name")
            if (!tag.startsWith(TAG_PREFIX) || r.optBoolean("draft")) continue
            val assets = r.optJSONArray("assets") ?: continue
            for (j in 0 until assets.length()) {
                val a = assets.getJSONObject(j)
                if (a.optString("name") == ASSET) {
                    return Release(tag.removePrefix(TAG_PREFIX), a.getString("browser_download_url"), a.optLong("size"))
                }
            }
        }
        throw IOException("Релиз DroidVM OS пока не опубликован")
    }

    /**
     * Скачать и распаковать. progress(процент, текст). Возвращает созданную ВМ.
     */
    fun install(ctx: Context, rel: Release, cancelled: AtomicBoolean, progress: (Int, String) -> Unit): VmConfig {
        val root = VmStore.imagesDir(ctx)
        if (rel.size > 0 && root.usableSpace < rel.size + 512L * 1024 * 1024) {
            throw IOException("Нужно ${humanSize(rel.size + 512L * 1024 * 1024)} свободного места, есть ${humanSize(root.usableSpace)}")
        }
        val dir = File(root, "DroidVM-OS-${rel.tag}")
        val tmp = File(root, "DroidVM-OS-${rel.tag}.part")
        tmp.deleteRecursively(); tmp.mkdirs()

        val c = open(rel.url)
        if (c.responseCode != 200) throw IOException("Загрузка: HTTP ${c.responseCode}")
        val total = if (rel.size > 0) rel.size else c.contentLengthLong
        var done = 0L
        var last = 0L
        val counting = object : java.io.FilterInputStream(c.inputStream.buffered(1 shl 20)) {
            override fun read(b: ByteArray, off: Int, len: Int): Int {
                if (cancelled.get()) throw InterruptedException("Отменено")
                val n = super.read(b, off, len)
                if (n > 0) {
                    done += n
                    val now = System.currentTimeMillis()
                    if (now - last > 300) {
                        last = now
                        val p = if (total > 0) (done * 100 / total).toInt() else -1
                        progress(p, "${humanSize(done)}${if (total > 0) " из ${humanSize(total)}" else ""}")
                    }
                }
                return n
            }
        }
        try {
            ZipInputStream(counting).use { zip ->
                val buf = ByteArray(1 shl 20)
                while (true) {
                    val e = zip.nextEntry ?: break
                    if (e.isDirectory || e.name.contains("..") || e.name.contains('/')) continue
                    File(tmp, e.name).outputStream().use { out ->
                        while (true) {
                            val n = zip.read(buf); if (n < 0) break
                            out.write(buf, 0, n)
                        }
                    }
                }
            }
        } catch (t: Throwable) {
            tmp.deleteRecursively(); throw t
        } finally {
            c.disconnect()
        }
        if (!File(tmp, "vda.qcow2").exists()) { tmp.deleteRecursively(); throw IOException("В архиве нет vda.qcow2") }
        dir.deleteRecursively()
        if (!tmp.renameTo(dir)) throw IOException("Не удалось сохранить образ")
        progress(100, "Создаю виртуальную машину…")
        return createVm(ctx, dir, rel.tag)
    }

    fun createVm(ctx: Context, dir: File, version: String): VmConfig {
        val meta = runCatching { JSONObject(File(dir, "droidvm-os.json").readText()) }.getOrNull()
        val am = ctx.getSystemService(ActivityManager::class.java)
        val mi = ActivityManager.MemoryInfo().also { am.getMemoryInfo(it) }
        val totalMb = (mi.totalMem / 1024 / 1024).toInt()
        val wantRam = meta?.optInt("ramMb", 3072) ?: 3072
        val ram = minOf(wantRam, (totalMb / 2 / 256) * 256).coerceAtLeast(2048)
        val cores = Runtime.getRuntime().availableProcessors()
        val disks = mutableListOf("", "", "")
        listOf("vda.qcow2", "vdb.qcow2").forEachIndexed { i, n -> File(dir, n).takeIf { it.exists() }?.let { disks[i] = it.absolutePath } }
        val cfg = VmConfig(
            name = "DroidVM OS $version",
            arch = VmConfig.ARCH_ARM,
            ramMb = ram,
            cpus = cores.coerceIn(2, 4),
            bootMode = VmConfig.BOOT_UEFI,
            disks = disks,
            diskIface = "virtio",
            gpu = "virtio",
            input = "usb",
            net = "virtio",
            adbPort = 5555,
            tbSizeMb = if (totalMb >= 7000) 1024 else 512,
            multiThread = true,
            resolution = "720x1280",
            density = 320,
        )
        VmStore.save(ctx, cfg)
        // Переменные UEFI из пакета (порядок загрузки уже настроен)
        File(dir, "efi_vars.fd").takeIf { it.exists() }?.copyTo(File(VmStore.vmDir(ctx, cfg.id), "efivars.fd"), overwrite = true)
        return cfg
    }
}
