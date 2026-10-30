package com.droidvm.app

import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ShortcutInfo
import android.content.pm.ShortcutManager
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.drawable.Icon
import android.os.BatteryManager
import java.io.File

/** Полезные инструменты: очистка ОЗУ, освобождение места, ярлыки, температура. */
object Tools {

    // ---------------- ОЗУ ----------------

    data class RamResult(val freedBytes: Long, val apps: Int, val vmMb: Int?, val availAfter: Long, val total: Long)

    private fun avail(ctx: Context): Pair<Long, Long> {
        val am = ctx.getSystemService(ActivityManager::class.java)
        val mi = ActivityManager.MemoryInfo().also { am.getMemoryInfo(it) }
        return mi.availMem to mi.totalMem
    }

    /** Вызывать в фоне. */
    fun cleanRam(ctx: Context, progress: (String) -> Unit): RamResult {
        val am = ctx.getSystemService(ActivityManager::class.java)
        val (before, _) = avail(ctx)
        progress("Закрываю фоновые приложения…")
        val pm = ctx.packageManager
        var n = 0
        @Suppress("DEPRECATION")
        for (app in pm.getInstalledApplications(0)) {
            if (app.packageName == ctx.packageName) continue
            runCatching { am.killBackgroundProcesses(app.packageName); n++ }
        }
        progress("Освобождаю кэши приложения…")
        System.gc(); Runtime.getRuntime().gc()
        File(ctx.cacheDir, "qemu-tmp").listFiles()?.forEach { if (System.currentTimeMillis() - it.lastModified() > 60_000) it.deleteRecursively() }
        val vm = if (VmRunner.state == VmRunner.State.RUNNING) VmRunner.compactGuest(ctx, progress) else null
        Thread.sleep(1500)
        val (after, total) = avail(ctx)
        return RamResult((after - before).coerceAtLeast(0), n, vm, after, total)
    }

    // ---------------- место ----------------

    data class Junk(val title: String, val files: List<File>, val bytes: Long, val safe: Boolean)

    private fun size(f: File): Long = if (f.isDirectory) f.listFiles()?.sumOf { size(it) } ?: 0 else f.length()

    /** Найти то, что можно удалить. safe = отмечено по умолчанию (точно не нужно). */
    fun findJunk(ctx: Context): List<Junk> {
        val out = mutableListOf<Junk>()
        val root = VmStore.imagesDir(ctx)
        val vms = VmStore.list(ctx)
        val used = vms.flatMap { it.disks + it.iso + it.kernel + it.initrd }.filter { it.isNotBlank() }.map { File(it).absolutePath }.toSet()
        val running = VmRunner.isActive
        val old = System.currentTimeMillis() - 30 * 60_000

        // недокачанные и временные файлы (не трогаем свежие — вдруг загрузка идёт)
        val partial = root.walkTopDown().filter { it.isFile && (it.name.endsWith(".part") || it.name.endsWith(".chunks") || it.name.endsWith(".tmp")) && it.lastModified() < old }.toList()
        if (partial.isNotEmpty()) out += Junk("Недокачанные и временные файлы", partial, partial.sumOf { it.length() }, true)

        // старые версии DroidVM OS, которыми не пользуется ни одна машина
        root.listFiles()?.filter { it.isDirectory && it.name.startsWith("DroidVM-OS-") }?.forEach { d ->
            val inUse = d.listFiles()?.any { it.absolutePath in used } == true
            if (!inUse) out += Junk("DroidVM OS ${d.name.removePrefix("DroidVM-OS-")} (не используется)", listOf(d), size(d), false)
        }
        // GSI: образы систем без машин и основа, если GSI-машин не осталось
        val gsi = File(root, "GSI")
        gsi.listFiles()?.filter { it.isFile && it.name.endsWith(".qcow2") && it.absolutePath !in used }?.forEach {
            out += Junk("GSI ${it.name.removeSuffix(".qcow2")} (без машины)", listOf(it), it.length(), false)
        }
        val gsiVms = vms.any { vm -> vm.disks.any { it.startsWith(gsi.absolutePath) } }
        File(gsi, "base").listFiles()?.filter { it.isFile }?.let { b ->
            if (!gsiVms && b.isNotEmpty()) out += Junk("Основа для GSI (GSI-машин нет)", b, b.sumOf { it.length() }, true)
        }
        // ISO NOVA OS без машины
        File(root, "NOVA-OS").listFiles()?.filter { it.name.endsWith(".iso") && it.absolutePath !in used }?.forEach {
            out += Junk("ISO ${it.name} (без машины)", listOf(it), it.length(), false)
        }
        // прочие образы в библиотеке, которые никто не использует
        root.listFiles()?.filter { it.isFile && it.absolutePath !in used && !it.name.endsWith(".part") }?.forEach {
            out += Junk("Образ ${it.name} (не подключён)", listOf(it), it.length(), false)
        }
        // кэш приложения
        val cache = ctx.cacheDir.listFiles()?.toList().orEmpty().filter { !(running && it.name == "qemu-tmp") }
        val cb = cache.sumOf { size(it) }
        if (cb > 1 shl 20) out += Junk("Кэш приложения", cache, cb, true)
        return out.sortedByDescending { it.bytes }
    }

    fun delete(j: Junk) = j.files.forEach { runCatching { it.deleteRecursively() } }

    // ---------------- ярлыки ----------------

    fun pinShortcut(ctx: Context, vm: VmConfig): Boolean {
        val sm = ctx.getSystemService(ShortcutManager::class.java) ?: return false
        if (!sm.isRequestPinShortcutSupported) return false
        val d = ctx.resources.displayMetrics.density
        val bmp = Bitmap.createBitmap((108 * d).toInt(), (108 * d).toInt(), Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        c.drawColor(Ui.BG)
        val p = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeWidth = 4 * d; strokeCap = Paint.Cap.ROUND; color = Ui.ACCENT }
        val f = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Ui.ACCENT }
        Icons.draw(c, if (vm.name.startsWith("DroidVM OS")) Icons.Icon.ROBOT else Icons.Icon.SCREEN,
            bmp.width / 2f, bmp.height / 2f, 26 * d, p, f, d)
        val intent = Intent(ctx, MainActivity::class.java).setAction(Intent.ACTION_VIEW).putExtra(MainActivity.EXTRA_LAUNCH, vm.id)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        val info = ShortcutInfo.Builder(ctx, "vm-${vm.id}").setShortLabel(vm.name.take(24)).setLongLabel(vm.name)
            .setIcon(Icon.createWithAdaptiveBitmap(bmp)).setIntent(intent).build()
        return sm.requestPinShortcut(info, null)
    }

    // ---------------- батарея ----------------

    /** Температура батареи в °C или null. */
    fun batteryTemp(ctx: Context): Float? {
        val i = ctx.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED)) ?: return null
        val t = i.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, Int.MIN_VALUE)
        return if (t == Int.MIN_VALUE) null else t / 10f
    }
}
