package com.droidvm.app

import java.io.File

/** Нагрузка процесса QEMU: процессор (% от одного ядра, может быть >100) и память. */
object VmStats {
    data class Snapshot(val cpuPercent: Int, val rssBytes: Long, val uptimeSec: Long)

    private var lastTicks = -1L
    private var lastTime = 0L
    private val hz = 100L

    fun read(pid: Int, startedAt: Long): Snapshot? = runCatching {
        val stat = File("/proc/$pid/stat").readText()
        val f = stat.substringAfterLast(") ").split(' ')
        val ticks = f[11].toLong() + f[12].toLong() // utime + stime
        val now = System.nanoTime()
        var cpu = 0
        if (lastTicks >= 0 && now > lastTime) {
            val sec = (now - lastTime) / 1e9
            cpu = (((ticks - lastTicks).toDouble() / hz) / sec * 100).toInt()
        }
        lastTicks = ticks; lastTime = now
        val rss = File("/proc/$pid/status").readLines().firstOrNull { it.startsWith("VmRSS:") }
            ?.replace(Regex("[^0-9]"), "")?.toLongOrNull()?.times(1024) ?: 0L
        Snapshot(cpu, rss, (System.currentTimeMillis() - startedAt) / 1000)
    }.getOrNull()

    fun reset() { lastTicks = -1 }
}
