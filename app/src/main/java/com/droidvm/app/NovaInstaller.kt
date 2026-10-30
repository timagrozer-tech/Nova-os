package com.droidvm.app

import android.content.Context
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.io.RandomAccessFile
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.atomic.AtomicBoolean

/**
 * NOVA OS (Debian 13 + KDE Plasma 6, x86_64) — ISO из релиза nova-os-latest.
 * ISO лежит частями по < 2 ГБ: приложение качает их в несколько потоков и склеивает.
 */
object NovaInstaller {
    private const val BASE = "https://github.com/${OsInstaller.REPO}/releases/download/nova-os-latest"

    data class Part(val name: String, val size: Long)
    data class Release(val version: String, val about: String, val parts: List<Part>) {
        val total get() = parts.sumOf { it.size }
        val tag get() = version.substringBefore(' ').replace(Regex("[^A-Za-z0-9._-]"), "_")
    }

    @Volatile var cached: Release? = null; private set
    @Volatile private var cachedAt = 0L

    fun latest(): Release {
        val c = URL("$BASE/nova-os.json").openConnection() as HttpURLConnection
        c.instanceFollowRedirects = true; c.connectTimeout = 20_000; c.readTimeout = 30_000
        c.setRequestProperty("User-Agent", "DroidVM")
        if (c.responseCode == 404) throw IOException("NOVA OS ещё не опубликована для DroidVM. Попробуйте через несколько минут.")
        if (c.responseCode != 200) throw IOException("HTTP ${c.responseCode}")
        val o = JSONObject(c.inputStream.bufferedReader().readText())
        val a = o.getJSONArray("parts")
        return Release(o.optString("version"), o.optString("about"),
            (0 until a.length()).map { a.getJSONObject(it).let { p -> Part(p.getString("name"), p.getLong("size")) } })
    }

    fun latestCached(): Release? {
        if (System.currentTimeMillis() - cachedAt < 10 * 60_000) return cached
        val r = runCatching { latest() }.getOrNull()
        cachedAt = System.currentTimeMillis()
        if (r != null) cached = r
        return cached
    }

    private fun dir(ctx: Context) = File(VmStore.imagesDir(ctx), "NOVA-OS").apply { mkdirs() }

    /** Уже скачанный ISO (последний). */
    fun installedIso(ctx: Context): File? =
        dir(ctx).listFiles()?.filter { it.name.endsWith(".iso") }?.maxByOrNull { it.lastModified() }

    fun install(ctx: Context, rel: Release, cancelled: AtomicBoolean, progress: (Int, String) -> Unit): VmConfig {
        val d = dir(ctx)
        val iso = File(d, "nova-os-${rel.tag}.iso")
        if (!(iso.exists() && iso.length() == rel.total)) {
            val have = rel.parts.sumOf { p -> File(d, p.name).let { f -> if (f.exists() && f.length() == p.size) p.size else File(f.path + ".part").let { if (it.exists()) it.length() else 0L } } }
            val need = rel.total * 2 - have + (33L shl 30) / 8 // части + склейка + запас под диск
            if (d.usableSpace < need) throw IOException("Нужно около ${humanSize(need)} свободного места, есть ${humanSize(d.usableSpace)}")
            var finished = 0L
            val t0 = System.currentTimeMillis()
            for (p in rel.parts) {
                val dl = Downloader("$BASE/${p.name}", p.size, File(d, p.name), 6, cancelled)
                val w = Thread {
                    while (!Thread.currentThread().isInterrupted) {
                        val got = finished + dl.done.get(); val sec = (System.currentTimeMillis() - t0) / 1000.0
                        val sp = if (sec > 1) got / sec else 0.0
                        val left = if (sp > 0) ((rel.total - got) / sp).toLong() else -1
                        progress((got * 100 / rel.total).toInt(), "${humanSize(got)} из ${humanSize(rel.total)} · ${humanSize(sp.toLong())}/с" +
                            if (left >= 0) " · осталось ${left / 60} мин" else "")
                        try { Thread.sleep(400) } catch (e: InterruptedException) { break }
                    }
                }.apply { start() }
                try { dl.run() } finally { w.interrupt() }
                finished += p.size
            }
            // Склейка частей в один ISO (каждая часть удаляется сразу после копирования)
            val tmp = File(iso.path + ".tmp")
            RandomAccessFile(tmp, "rw").use { out ->
                out.setLength(0)
                var done = 0L
                val buf = ByteArray(4 shl 20)
                for (p in rel.parts) {
                    val f = File(d, p.name)
                    f.inputStream().use { inp ->
                        while (true) {
                            if (cancelled.get()) throw InterruptedException("Отменено")
                            val n = inp.read(buf); if (n < 0) break
                            out.write(buf, 0, n); done += n
                        }
                    }
                    f.delete()
                    progress((done * 100 / rel.total).toInt(), "Собираю ISO: ${humanSize(done)} из ${humanSize(rel.total)}")
                }
            }
            if (tmp.length() != rel.total) { tmp.delete(); throw IOException("Размер ISO не совпал — попробуйте ещё раз") }
            iso.delete(); tmp.renameTo(iso)
            // старые версии ISO больше не нужны
            d.listFiles()?.filter { it.name.endsWith(".iso") && it != iso && VmStore.usersOf(ctx, it.absolutePath).isEmpty() }?.forEach { it.delete() }
        }

        progress(-1, "Создаю машину…")
        val env = QemuEnv(ctx.applicationContext)
        val am = ctx.getSystemService(android.app.ActivityManager::class.java)
        val totalMb = (android.app.ActivityManager.MemoryInfo().also { am.getMemoryInfo(it) }.totalMem / 1048576).toInt()
        val cfg = VmConfig(
            name = "NOVA OS ${rel.version.substringBefore(' ')}",
            arch = VmConfig.ARCH_X86, machine = "q35", bootMode = VmConfig.BOOT_BIOS,
            ramMb = minOf(4096, totalMb / 2 / 256 * 256).coerceAtLeast(2048),
            cpus = Runtime.getRuntime().availableProcessors().coerceIn(2, 4),
            iso = iso.absolutePath, bootFromIso = true, diskIface = "sata",
            gpu = "virtio", resolution = "1280x800", density = 0,
            input = "usb", net = "virtio", adbPort = 0,
            tbSizeMb = if (totalMb >= 7000) 1024 else 512, multiThread = true,
        )
        val disk = File(VmStore.vmDir(ctx, cfg.id), "nova-disk.qcow2")
        env.createDisk(disk, 32, true)?.let { VmStore.delete(ctx, cfg.id); throw IOException("Диск: $it") }
        cfg.disks = mutableListOf(disk.absolutePath, "", "")
        VmStore.save(ctx, cfg)
        return cfg
    }
}
