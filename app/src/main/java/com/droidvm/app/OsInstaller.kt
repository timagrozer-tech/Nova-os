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

    data class Asset(val name: String, val url: String, val size: Long)
    data class Release(val tag: String, val assets: List<Asset>) {
        val total get() = assets.sumOf { maxOf(it.size, 0L) }
    }

    private val FILES = listOf("droidvm-os-vda.qcow2", "droidvm-os-vdb.qcow2", "droidvm-os.json")

    private fun open(url: String): HttpURLConnection {
        val c = URL(url).openConnection() as HttpURLConnection
        c.connectTimeout = 20_000
        c.readTimeout = 60_000
        c.instanceFollowRedirects = true
        c.setRequestProperty("User-Agent", "DroidVM")
        c.setRequestProperty("Accept", "application/vnd.github+json, */*")
        return c
    }

    private const val STABLE = "https://github.com/$REPO/releases/download/droidvm-os-latest"

    /**
     * Найти последнюю прошивку. Основной путь — постоянная ссылка droidvm-os-latest
     * (обычная загрузка файла, без GitHub API и его лимита 60 запросов/час на IP).
     */
    fun latest(): Release = runCatching { stable() }.getOrElse { e ->
        runCatching { fromApi() }.getOrElse {
            if (e.message?.contains("404") == true) throw IOException("Прошивка ещё собирается и пока не опубликована. Попробуйте через несколько минут.")
            throw IOException("Не удалось найти прошивку: ${e.message}")
        }
    }

    private fun stable(): Release {
        val c = open("$STABLE/droidvm-os.json")
        if (c.responseCode != 200) throw IOException("HTTP ${c.responseCode}")
        val o = JSONObject(c.inputStream.bufferedReader().readText())
        val files = o.getJSONArray("files")
        val assets = (0 until files.length()).map { files.getJSONObject(it) }
            .map { Asset(it.getString("name"), "$STABLE/${it.getString("name")}", it.getLong("size")) } +
            Asset("droidvm-os.json", "$STABLE/droidvm-os.json", -1)
        return Release(o.optString("version", "latest"), assets)
    }

    private fun fromApi(): Release {
        val c = open("https://api.github.com/repos/$REPO/releases?per_page=30")
        if (c.responseCode != 200) throw IOException("GitHub ответил ${c.responseCode}")
        val arr = JSONArray(c.inputStream.bufferedReader().readText())
        for (i in 0 until arr.length()) {
            val r = arr.getJSONObject(i)
            val tag = r.optString("tag_name")
            if (!tag.startsWith(TAG_PREFIX) || r.optBoolean("draft")) continue
            val list = r.optJSONArray("assets") ?: continue
            val found = (0 until list.length()).map { list.getJSONObject(it) }
                .filter { it.optString("name") in FILES }
                .map { Asset(it.getString("name"), it.getString("browser_download_url"), it.optLong("size")) }
            if (found.size == FILES.size) return Release(tag.removePrefix(TAG_PREFIX), found.sortedBy { FILES.indexOf(it.name) })
        }
        throw IOException("Релиз DroidVM OS пока не опубликован")
    }

    /**
     * Скачать диски прошивки в несколько потоков прямо в готовом виде (без распаковки) и создать ВМ.
     * При обрыве и повторном нажатии загрузка продолжится с того же места.
     */
    fun install(ctx: Context, rel: Release, cancelled: AtomicBoolean, progress: (Int, String) -> Unit): VmConfig {
        val root = VmStore.imagesDir(ctx)
        val dir = File(root, "DroidVM-OS-${rel.tag}").apply { mkdirs() }
        val already = rel.assets.sumOf { a -> File(dir, a.name).let { if (it.exists() && it.length() == a.size) a.size else File(it.path + ".part").let { p -> if (p.exists()) p.length() else 0L } } }
        val need = rel.total - already + 256L * 1024 * 1024
        if (root.usableSpace < need) {
            throw IOException("Нужно ${humanSize(need)} свободного места, есть ${humanSize(root.usableSpace)}")
        }
        var finished = 0L
        val t0 = System.currentTimeMillis()
        for (a in rel.assets) {
            if (a.size < 0) { // маленький файл описания — просто скачать
                open(a.url).inputStream.use { inp -> File(dir, a.name).outputStream().use { inp.copyTo(it) } }
                continue
            }
            val d = Downloader(a.url, a.size, File(dir, a.name), if (a.size > (256L shl 20)) 6 else 2, cancelled)
            val watcher = Thread {
                while (!Thread.currentThread().isInterrupted) {
                    val got = finished + d.done.get()
                    val sec = (System.currentTimeMillis() - t0) / 1000.0
                    val speed = if (sec > 1) got / sec else 0.0
                    val left = if (speed > 0) ((rel.total - got) / speed).toLong() else -1
                    val eta = if (left >= 0) " · осталось ${left / 60}:${String.format(java.util.Locale.US, "%02d", left % 60)}" else ""
                    progress((got * 100 / rel.total).toInt(),
                        "${humanSize(got)} из ${humanSize(rel.total)} · ${humanSize(speed.toLong())}/с$eta")
                    try { Thread.sleep(400) } catch (e: InterruptedException) { break }
                }
            }.apply { start() }
            try { d.run() } finally { watcher.interrupt() }
            finished += a.size
        }
        progress(100, "Создаю виртуальную машину…")
        return createVm(ctx, dir, rel.tag)
    }

    fun createVm(ctx: Context, dir: File, version: String): VmConfig {
        val meta = runCatching { JSONObject(File(dir, "droidvm-os.json").readText()) }.getOrNull()
        // Удалить ВМ этой же версии, если ставим повторно
        VmStore.list(ctx).filter { it.name == "DroidVM OS $version" && VmRunner.current?.id != it.id }.forEach { VmStore.delete(ctx, it.id) }
        val am = ctx.getSystemService(ActivityManager::class.java)
        val mi = ActivityManager.MemoryInfo().also { am.getMemoryInfo(it) }
        val totalMb = (mi.totalMem / 1024 / 1024).toInt()
        val wantRam = meta?.optInt("ramMb", 3072) ?: 3072
        val ram = minOf(wantRam, (totalMb / 2 / 256) * 256).coerceAtLeast(2048)
        val cores = Runtime.getRuntime().availableProcessors()
        val disks = mutableListOf("", "", "")
        val names = meta?.optJSONArray("disks")?.let { a -> (0 until a.length()).map { a.getString(it) } }
            ?: listOf("droidvm-os-vda.qcow2", "droidvm-os-vdb.qcow2")
        names.take(3).forEachIndexed { i, n -> File(dir, n).takeIf { it.exists() }?.let { disks[i] = it.absolutePath } }
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
