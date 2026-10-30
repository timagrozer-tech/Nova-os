package com.droidvm.app

import android.content.Context
import java.io.File
import java.util.zip.ZipInputStream

/**
 * Окружение QEMU внутри приложения.
 *
 * Исполняемые файлы QEMU лежат в APK как "нативные библиотеки"
 * (lib/arm64-v8a/libqemu-system-x86_64.so и т.п.) — только оттуда Android 10+
 * разрешает запускать бинарники. Прошивки/BIOS лежат в assets/qemu-data.zip и
 * распаковываются в filesDir при первом запуске.
 */
class QemuEnv(val ctx: Context) {

    val libDir = File(ctx.applicationInfo.nativeLibraryDir)
    val dataDir = File(ctx.filesDir, "qemu-data")
    val modulesDir = File(ctx.filesDir, "qemu-modules")
    val runDir = File(ctx.filesDir, "run").apply { mkdirs() }
    val vncSocket = File(runDir, "vnc.sock")
    val monitorSocket = File(runDir, "monitor.sock")
    val tmpDir = File(ctx.cacheDir, "qemu-tmp")

    fun binary(arch: String) = File(libDir, if (arch == VmConfig.ARCH_ARM) "libqemu-system-aarch64.so" else "libqemu-system-x86_64.so")
    val qemuImg get() = File(libDir, "libqemu-img.so")

    fun hasBinary(arch: String) = binary(arch).exists()

    fun status(): String {
        val x = if (hasBinary(VmConfig.ARCH_X86)) "✓" else "✗"
        val a = if (hasBinary(VmConfig.ARCH_ARM)) "✓" else "✗"
        val i = if (qemuImg.exists()) "✓" else "✗"
        return "QEMU: x86_64 $x · aarch64 $a · qemu-img $i"
    }

    fun environment(): Map<String, String> = mapOf(
        "LD_LIBRARY_PATH" to libDir.absolutePath,
        "TMPDIR" to tmpDir.absolutePath,
        "HOME" to ctx.filesDir.absolutePath,
        "QEMU_MODULE_DIR" to modulesDir.absolutePath,
    )

    /** Распаковывает прошивки и создаёт ссылки на модули. Вызывать в фоновом потоке. */
    @Synchronized
    fun prepare() {
        tmpDir.mkdirs()
        val stamp = File(dataDir, ".stamp")
        val want = appStamp()
        if (!stamp.exists() || stamp.readText() != want) {
            dataDir.deleteRecursively()
            dataDir.mkdirs()
            runCatching {
                ctx.assets.open("qemu-data.zip").use { input ->
                    ZipInputStream(input.buffered()).use { zip ->
                        while (true) {
                            val e = zip.nextEntry ?: break
                            val out = File(dataDir, e.name)
                            if (!out.canonicalPath.startsWith(dataDir.canonicalPath)) continue
                            if (e.isDirectory) out.mkdirs() else {
                                out.parentFile?.mkdirs()
                                out.outputStream().use { zip.copyTo(it) }
                            }
                        }
                    }
                }
            }
            stamp.writeText(want)
        }
        // Модули QEMU (если QEMU собран с --enable-modules): в APK они переименованы
        // в libqmod_<имя>.so, здесь возвращаем им исходные имена символьными ссылками.
        modulesDir.deleteRecursively()
        modulesDir.mkdirs()
        runCatching {
            ctx.assets.open("qemu-modules.txt").bufferedReader().readLines()
        }.getOrDefault(emptyList()).forEach { line ->
            val parts = line.trim().split('=')
            if (parts.size == 2) {
                val target = File(libDir, parts[0])
                if (target.exists()) runCatching {
                    android.system.Os.symlink(target.absolutePath, File(modulesDir, parts[1]).absolutePath)
                }
            }
        }
    }

    private fun appStamp(): String {
        val pi = ctx.packageManager.getPackageInfo(ctx.packageName, 0)
        return "${pi.lastUpdateTime}"
    }

    fun firmware(name: String) = File(dataDir, name)

    /** Создать пустой диск через qemu-img. Возвращает текст ошибки или null. */
    fun createDisk(file: File, sizeGb: Int, qcow2: Boolean): String? {
        if (!qemuImg.exists()) return "qemu-img не встроен в сборку"
        val pb = ProcessBuilder(
            qemuImg.absolutePath, "create", "-f", if (qcow2) "qcow2" else "raw",
            file.absolutePath, "${sizeGb}G"
        ).redirectErrorStream(true)
        pb.environment().putAll(environment())
        return runCatching {
            val p = pb.start()
            val out = p.inputStream.bufferedReader().readText()
            if (p.waitFor() == 0) null else out.ifBlank { "qemu-img завершился с ошибкой" }
        }.getOrElse { it.toString() }
    }
}
