package com.droidvm.app

import android.Manifest
import android.app.Activity
import android.app.ActivityManager
import android.app.AlertDialog
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import com.droidvm.app.Ui.dp

/** Список виртуальных машин. */
class MainActivity : Activity(), VmRunner.Listener {

    private lateinit var list: LinearLayout
    private lateinit var status: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.decorView.setBackgroundColor(Ui.BG)
        val root = Ui.vbox(this)
        val header = Ui.hbox(this)
        header.addView(Ui.title(this, "DroidVM"), Ui.weight())
        header.addView(Ui.button(this, "+ Новая ВМ", primary = true) { newVm() })
        root.addView(header)
        root.addView(Ui.button(this, "⬇ Установить DroidVM OS (Android 16 + root)", primary = true) { installOs() },
            Ui.lp(top = 12, ctx = this))
        status = Ui.label(this, "", 12f)
        root.addView(status, Ui.lp(top = 6, ctx = this))
        list = Ui.vbox(this, 0)
        root.addView(list, Ui.lp(top = 12, ctx = this))
        val footer = Ui.hbox(this)
        footer.addView(Ui.button(this, "Образы") { startActivity(Intent(this, ImagesActivity::class.java)) }, Ui.weight())
        footer.addView(Ui.button(this, "Журнал QEMU") { startActivity(Intent(this, LogActivity::class.java)) },
            Ui.weight().apply { leftMargin = dp(8) })
        root.addView(footer, Ui.lp(top = 16, ctx = this))
        setContentView(ScrollView(this).apply { addView(root); isFillViewport = true })

        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
        }
    }

    override fun onResume() {
        super.onResume()
        VmRunner.addListener(this)
        refresh()
    }

    override fun onPause() {
        VmRunner.removeListener(this)
        super.onPause()
    }

    override fun onStateChanged(state: VmRunner.State) = refresh()

    private fun refresh() {
        val env = QemuEnv(this)
        val mi = ActivityManager.MemoryInfo().also { (getSystemService(ACTIVITY_SERVICE) as ActivityManager).getMemoryInfo(it) }
        status.text = env.status() + "\nСвободно ОЗУ: ${humanSize(mi.availMem)} из ${humanSize(mi.totalMem)} · ядер: ${Runtime.getRuntime().availableProcessors()}"
        list.removeAllViews()
        val vms = VmStore.list(this)
        if (vms.isEmpty()) {
            list.addView(Ui.label(this, "Пока нет ни одной виртуальной машины.\n\nНажмите «+ Новая ВМ», выберите шаблон " +
                "(например, Android-x86 / BlissOS для ISO или ARM64 для своей сборки AOSP), " +
                "затем импортируйте образ с телефона.", 15f).apply { gravity = Gravity.START })
            return
        }
        for (vm in vms) {
            val running = VmRunner.current?.id == vm.id && VmRunner.isActive
            val card = Ui.card(this)
            card.addView(Ui.title(this, vm.name, 18f))
            card.addView(Ui.label(this, vm.summary() + if (running) "\n● ${stateText()}" else ""))
            val row = Ui.hbox(this)
            if (running) {
                row.addView(Ui.button(this, "Экран", primary = true) { openScreen() }, Ui.weight())
                row.addView(Ui.button(this, "Остановить") { VmRunner.kill(this) }, Ui.weight().apply { leftMargin = dp(8) })
            } else {
                row.addView(Ui.button(this, "▶ Запустить", primary = true) { start(vm) }, Ui.weight())
                row.addView(Ui.button(this, "Настроить") { edit(vm.id) }, Ui.weight().apply { leftMargin = dp(8) })
                row.addView(Ui.button(this, "Удалить") { delete(vm) }, Ui.weight(0.8f).apply { leftMargin = dp(8) })
            }
            card.addView(row, Ui.lp(top = 10, ctx = this))
            list.addView(card, Ui.lp(top = 0, ctx = this).apply { bottomMargin = dp(12) })
        }
    }

    private fun stateText() = when (VmRunner.state) {
        VmRunner.State.STARTING -> "запускается"
        VmRunner.State.RUNNING -> "работает"
        VmRunner.State.STOPPING -> "останавливается"
        VmRunner.State.IDLE -> "остановлена"
    }

    private fun newVm() {
        val templates = VmConfig.templates(Runtime.getRuntime().availableProcessors())
        AlertDialog.Builder(this).setTitle("Шаблон новой ВМ")
            .setItems(templates.map { it.first }.toTypedArray()) { _, i ->
                val cfg = templates[i].second
                VmStore.save(this, cfg)
                edit(cfg.id)
            }.show()
    }

    private fun edit(id: String) = startActivity(Intent(this, EditVmActivity::class.java).putExtra("id", id))

    private fun delete(vm: VmConfig) {
        AlertDialog.Builder(this).setTitle("Удалить «${vm.name}»?")
            .setMessage("Удаляется только конфигурация. Файлы образов остаются в разделе «Образы».")
            .setPositiveButton("Удалить") { _, _ -> VmStore.delete(this, vm.id); refresh() }
            .setNegativeButton("Отмена", null).show()
    }

    private fun openScreen() = startActivity(Intent(this, ScreenActivity::class.java))

    private fun start(vm: VmConfig) {
        if (VmRunner.isActive) { Ui.alert(this, "Уже работает ВМ", "Сначала остановите «${VmRunner.current?.name}»."); return }
        val mi = ActivityManager.MemoryInfo().also { (getSystemService(ACTIVITY_SERVICE) as ActivityManager).getMemoryInfo(it) }
        val needBytes = vm.ramMb.toLong() * 1024 * 1024
        if (needBytes > mi.availMem) {
            AlertDialog.Builder(this).setTitle("Мало свободной памяти")
                .setMessage("ВМ просит ${vm.ramMb} МБ, а свободно ${humanSize(mi.availMem)}. Android может закрыть приложение. Запустить всё равно?")
                .setPositiveButton("Запустить") { _, _ -> doStart(vm) }
                .setNegativeButton("Отмена", null).show()
        } else doStart(vm)
    }

    private fun installOs() {
        val cancelled = java.util.concurrent.atomic.AtomicBoolean(false)
        val (dlg, upd) = Ui.progress(this, "DroidVM OS") { cancelled.set(true) }
        upd(-1, "Ищу последнюю версию…")
        Thread {
            val res = runCatching {
                val rel = OsInstaller.latest()
                runOnUiThread { dlg.setTitle("DroidVM OS ${rel.tag}") }
                OsInstaller.install(this, rel, cancelled, upd)
            }
            runOnUiThread {
                dlg.dismiss()
                res.onSuccess { vm ->
                    refresh()
                    AlertDialog.Builder(this).setTitle("Готово")
                        .setMessage("Создана ВМ «${vm.name}».\n\nПервая загрузка в эмуляции занимает несколько минут. " +
                            "Root — через приложение Magisk, adb: `adb connect 127.0.0.1:5555` из Termux.")
                        .setPositiveButton("Запустить") { _, _ -> start(vm) }
                        .setNegativeButton("Позже", null).show()
                }.onFailure { e ->
                    if (e !is InterruptedException) Ui.alert(this, "Не удалось установить", e.message ?: e.toString())
                }
            }
        }.start()
    }

    private fun doStart(vm: VmConfig) {
        val (dlg, upd) = Ui.progress(this, "Запуск «${vm.name}»")
        upd(-1, "Подготовка QEMU…")
        Thread {
            val err = runCatching { VmRunner.start(this, vm) }.exceptionOrNull()
            runOnUiThread {
                dlg.dismiss()
                if (err != null) Ui.alert(this, "Не удалось запустить", err.message ?: err.toString())
                else openScreen()
                refresh()
            }
        }.start()
    }
}
