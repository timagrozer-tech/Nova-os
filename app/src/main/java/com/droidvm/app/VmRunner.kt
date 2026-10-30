package com.droidvm.app

import android.content.Context
import android.content.Intent
import android.net.LocalSocket
import android.net.LocalSocketAddress
import android.os.Build
import android.os.Handler
import android.os.Looper
import java.io.File
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Запуск и контроль процесса QEMU. Одновременно работает одна ВМ —
 * телефону и так тяжело эмулировать целый Android.
 */
object VmRunner {

    enum class State { IDLE, STARTING, RUNNING, STOPPING }

    interface Listener {
        fun onStateChanged(state: State) {}
        fun onLog(line: String) {}
    }

    @Volatile var state = State.IDLE; private set
    @Volatile var current: VmConfig? = null; private set
    @Volatile var lastExitCode: Int? = null; private set
    @Volatile var lastVmId: String? = null; private set
    /** Время запуска текущей ВМ (для индикатора загрузки) */
    @Volatile var startedAt = 0L; private set
    private var process: Process? = null
    private val listeners = CopyOnWriteArrayList<Listener>()
    private val main = Handler(Looper.getMainLooper())
    private val logLines = ArrayDeque<String>()
    private const val MAX_LOG = 3000

    /** PID процесса QEMU (для статистики нагрузки), -1 если не запущен. */
    val pid: Int get() = process?.let { p ->
        runCatching { p.javaClass.getDeclaredField("pid").apply { isAccessible = true }.getInt(p) }.getOrDefault(-1)
    } ?: -1

    fun addListener(l: Listener) { listeners += l }
    fun removeListener(l: Listener) { listeners -= l }

    fun logText(): String = synchronized(logLines) { logLines.joinToString("\n") }

    fun log(line: String) {
        synchronized(logLines) {
            logLines.addLast(line)
            while (logLines.size > MAX_LOG) logLines.removeFirst()
        }
        main.post { listeners.forEach { it.onLog(line) } }
    }

    private fun setState(s: State) {
        state = s
        main.post { listeners.forEach { it.onStateChanged(s) } }
    }

    val isActive get() = state != State.IDLE

    /** Запуск. Вызывать из фонового потока. Бросает исключение с понятным текстом при ошибке. */
    fun start(ctx: Context, cfg: VmConfig, resume: Boolean = false) {
        synchronized(this) {
            if (isActive) throw IllegalStateException("Уже запущена ВМ «${current?.name}». Сначала остановите её.")
            state = State.STARTING
            current = cfg
            lastVmId = cfg.id
        }
        setState(State.STARTING)
        try {
            val app = ctx.applicationContext
            val env = QemuEnv(app)
            if (!env.hasBinary(cfg.arch)) {
                throw QemuCommand.BuildError(
                    "В эту сборку приложения не встроен QEMU для ${cfg.arch}.\n" +
                        "Соберите APK скриптом scripts/fetch_qemu.py (см. README)."
                )
            }
            synchronized(logLines) { logLines.clear() }
            log("Подготовка окружения…")
            env.prepare()
            val vmDir = VmStore.vmDir(app, cfg.id)
            if (QemuCommand.usesUefi(cfg)) ensureQcowVars(env, cfg, vmDir)
            val doResume = resume && hasState(app, cfg)
            if (doResume) {
                log("Быстрый старт: восстанавливаю сохранённое состояние…")
                // Снимок одноразовый: после восстановления дальше работаем с диском как обычно
                stateFile(app, cfg.id).delete()
            } else {
                discardSnapshots(env, cfg, vmDir)
            }
            val args = QemuCommand.build(env, cfg, vmDir, doResume)
            env.vncSocket.delete(); env.monitorSocket.delete()
            File(vmDir, "serial.log").delete()
            log("$ " + args.joinToString(" "))

            val pb = ProcessBuilder(args).redirectErrorStream(true).directory(vmDir)
            pb.environment().putAll(env.environment())
            val p = pb.start()
            process = p
            lastExitCode = null
            startedAt = System.currentTimeMillis()
            setState(State.RUNNING)

            val intent = Intent(app, VmService::class.java)
            if (Build.VERSION.SDK_INT >= 26) app.startForegroundService(intent) else app.startService(intent)

            Thread({
                runCatching { p.inputStream.bufferedReader().forEachLine { log(it) } }
            }, "qemu-log").start()
            Thread({
                val code = runCatching { p.waitFor() }.getOrDefault(-1)
                lastExitCode = code
                log("QEMU завершился, код $code")
                process = null
                current = null
                setState(State.IDLE)
            }, "qemu-wait").start()
        } catch (e: Throwable) {
            log("Ошибка: ${e.message}")
            current = null
            setState(State.IDLE)
            throw e
        }
    }

    // ---------------- Быстрый старт (сохранение состояния) ----------------

    const val SNAPSHOT = "droidvm"

    fun stateFile(ctx: Context, id: String) = File(VmStore.vmDir(ctx, id), "state.json")

    /** Есть ли пригодное сохранённое состояние (параметры ВМ не менялись). */
    fun hasState(ctx: Context, cfg: VmConfig): Boolean {
        val f = stateFile(ctx, cfg.id)
        if (!f.exists()) return false
        val o = runCatching { org.json.JSONObject(f.readText()) }.getOrNull() ?: return false
        return o.optString("sig") == signature(cfg)
    }

    fun stateTime(ctx: Context, cfg: VmConfig): Long =
        runCatching { org.json.JSONObject(stateFile(ctx, cfg.id).readText()).optLong("time") }.getOrDefault(0L)

    /** Всё, что влияет на совместимость снимка с командной строкой QEMU. */
    private fun signature(cfg: VmConfig) = listOf(cfg.arch, cfg.ramMb, cfg.cpus, cfg.gpu, cfg.input, cfg.net,
        cfg.resolution, cfg.density, cfg.iso, cfg.disks.joinToString("|"), cfg.bootMode, cfg.machine).joinToString(";")

    private fun qcowFiles(cfg: VmConfig, vmDir: File): List<File> =
        (cfg.disks.filter { it.isNotBlank() }.map { File(it) } + File(vmDir, "efivars.qcow2"))
            .filter { it.exists() && it.name.endsWith(".qcow2", true) }

    /** Можно ли сохранять состояние: все записываемые диски должны быть qcow2. */
    fun canSave(cfg: VmConfig): String? {
        if (cfg.snapshot) return null
        val raw = cfg.disks.filter { it.isNotBlank() && !it.endsWith(".qcow2", true) }
        return if (raw.isEmpty()) null else "Диски в формате raw не поддерживают сохранение состояния: ${raw.joinToString { File(it).name }}"
    }

    private fun ensureQcowVars(env: QemuEnv, cfg: VmConfig, vmDir: File) {
        val q = File(vmDir, "efivars.qcow2")
        if (q.exists() || !env.qemuImg.exists()) return
        val raw = QemuCommand.rawVars(env, cfg, vmDir)
        if (!raw.exists()) return
        val r = runQemuImg(env, "convert", "-f", "raw", "-O", "qcow2", raw.absolutePath, q.absolutePath)
        if (r == null) { raw.delete(); log("Переменные UEFI переведены в qcow2") } else { q.delete(); log("qemu-img: $r") }
    }

    private fun discardSnapshots(env: QemuEnv, cfg: VmConfig, vmDir: File) {
        stateFile(env.ctx, cfg.id).delete()
        for (f in qcowFiles(cfg, vmDir)) {
            val list = runCatching {
                ProcessBuilder(env.qemuImg.absolutePath, "snapshot", "-l", f.absolutePath).redirectErrorStream(true)
                    .also { it.environment().putAll(env.environment()) }.start().inputStream.bufferedReader().readText()
            }.getOrDefault("")
            if (Regex("\\s$SNAPSHOT\\s").containsMatchIn(list)) {
                log("Удаляю старое сохранённое состояние в ${f.name}")
                runQemuImg(env, "snapshot", "-d", SNAPSHOT, f.absolutePath)
            }
        }
    }

    private fun runQemuImg(env: QemuEnv, vararg args: String): String? = runCatching {
        val p = ProcessBuilder(listOf(env.qemuImg.absolutePath) + args).redirectErrorStream(true)
            .also { it.environment().putAll(env.environment()) }.start()
        val out = p.inputStream.bufferedReader().readText()
        if (p.waitFor() == 0) null else out.ifBlank { "ошибка qemu-img" }
    }.getOrElse { it.toString() }

    /**
     * Сохранить состояние ВМ (память + устройства) внутрь qcow2 и выключить QEMU.
     * Следующий запуск продолжится с этого места за секунды. Возвращает ошибку или null.
     */
    fun saveStateAndQuit(ctx: Context, progress: (String) -> Unit): String? {
        val cfg = current ?: return "ВМ не запущена"
        canSave(cfg)?.let { return it }
        val app = ctx.applicationContext
        val disk = cfg.disks.firstOrNull { it.isNotBlank() }?.let { File(it) }
        val need = cfg.ramMb.toLong() * 1024 * 1024
        if (disk != null && disk.parentFile!!.usableSpace < need + 256L * 1024 * 1024) {
            return "Для сохранения нужно ~${humanSize(need)} свободного места"
        }
        progress("Останавливаю процессор ВМ…")
        monitorWait(app, "stop", 10_000) ?: return "Монитор QEMU недоступен"
        progress("Сохраняю память ВМ (${cfg.ramMb} МБ)… Это может занять минуту.")
        val out = monitorWait(app, "savevm $SNAPSHOT", 15 * 60_000) ?: return "Нет ответа от QEMU"
        if (out.contains("rror")) {
            monitorWait(app, "cont", 10_000)
            return out.trim().lines().lastOrNull { it.contains("rror") } ?: out.trim()
        }
        stateFile(app, cfg.id).writeText(org.json.JSONObject().put("sig", signature(cfg))
            .put("time", System.currentTimeMillis()).toString())
        progress("Готово, выключаю…")
        setState(State.STOPPING)
        monitorWait(app, "quit", 5_000)
        return null
    }

    /**
     * Команда монитора с ожиданием её завершения (до следующего приглашения "(qemu)").
     * Возвращает вывод команды или null, если монитор недоступен.
     */
    fun monitorWait(ctx: Context, cmd: String, timeoutMs: Int): String? {
        val sock = QemuEnv(ctx.applicationContext).monitorSocket
        return runCatching {
            LocalSocket().use { s ->
                s.connect(LocalSocketAddress(sock.absolutePath, LocalSocketAddress.Namespace.FILESYSTEM))
                s.soTimeout = 3000
                val inp = s.inputStream
                val buf = ByteArray(8192)
                fun readUntilPrompt(deadline: Long): String {
                    val sb = StringBuilder()
                    while (System.currentTimeMillis() < deadline) {
                        val n = try { inp.read(buf) } catch (e: java.net.SocketTimeoutException) { 0 }
                        if (n < 0) break
                        if (n > 0) sb.append(String(buf, 0, n))
                        if (sb.endsWith("(qemu) ")) break
                    }
                    return sb.toString()
                }
                readUntilPrompt(System.currentTimeMillis() + 5000) // приветствие
                s.outputStream.write((cmd + "\n").toByteArray()); s.outputStream.flush()
                val out = readUntilPrompt(System.currentTimeMillis() + timeoutMs)
                log("monitor> $cmd ${out.replace("(qemu) ", "").trim().take(300)}")
                out.removeSuffix("(qemu) ").substringAfter(cmd)
            }
        }.onFailure { log("Монитор недоступен: ${it.message}") }.getOrNull()
    }

    /** Отправить команду в монитор QEMU (HMP). Вызывать из фонового потока. */
    fun monitor(ctx: Context, cmd: String): String? {
        val sock = QemuEnv(ctx.applicationContext).monitorSocket
        return runCatching {
            LocalSocket().use { s ->
                s.connect(LocalSocketAddress(sock.absolutePath, LocalSocketAddress.Namespace.FILESYSTEM))
                s.soTimeout = 1500
                s.outputStream.write((cmd + "\n").toByteArray())
                s.outputStream.flush()
                val buf = ByteArray(8192)
                val sb = StringBuilder()
                runCatching {
                    while (true) {
                        val n = s.inputStream.read(buf)
                        if (n <= 0) break
                        sb.append(String(buf, 0, n))
                        if (sb.length > 64_000) break
                    }
                }
                sb.toString()
            }
        }.onFailure { log("Монитор недоступен: ${it.message}") }.getOrNull()
    }

    /** Мягкое выключение (как кнопка питания ACPI). */
    fun powerDown(ctx: Context) = Thread {
        log("→ ACPI: system_powerdown")
        monitor(ctx, "system_powerdown")
    }.start()

    fun reset(ctx: Context) = Thread {
        log("→ system_reset")
        monitor(ctx, "system_reset")
    }.start()

    /** Принудительная остановка. */
    fun kill(ctx: Context) = Thread {
        if (!isActive) return@Thread
        setState(State.STOPPING)
        log("→ quit")
        monitor(ctx, "quit")
        val p = process ?: return@Thread
        Thread.sleep(2500)
        if (runCatching { p.exitValue() }.isFailure) {
            log("QEMU не ответил — завершаю процесс")
            p.destroy()
            Thread.sleep(1500)
            if (runCatching { p.exitValue() }.isFailure && Build.VERSION.SDK_INT >= 26) p.destroyForcibly()
        }
    }.start()
}
