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
    private var process: Process? = null
    private val listeners = CopyOnWriteArrayList<Listener>()
    private val main = Handler(Looper.getMainLooper())
    private val logLines = ArrayDeque<String>()
    private const val MAX_LOG = 3000

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
    fun start(ctx: Context, cfg: VmConfig) {
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
            val args = QemuCommand.build(env, cfg, vmDir)
            env.vncSocket.delete(); env.monitorSocket.delete()
            File(vmDir, "serial.log").delete()
            log("$ " + args.joinToString(" "))

            val pb = ProcessBuilder(args).redirectErrorStream(true).directory(vmDir)
            pb.environment().putAll(env.environment())
            val p = pb.start()
            process = p
            lastExitCode = null
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
