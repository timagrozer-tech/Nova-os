package com.droidvm.app

import android.Manifest
import android.app.Activity
import android.app.ActivityManager
import android.app.AlertDialog
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.TextUtils
import android.view.Gravity
import android.view.View
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import com.droidvm.app.Icons.Icon
import com.droidvm.app.Ui.dp
import java.util.Locale

/** Главный экран: DroidVM OS и список виртуальных машин. */
class MainActivity : ImageActivityBase(), VmRunner.Listener {

    private lateinit var hero: LinearLayout
    private lateinit var list: LinearLayout
    private lateinit var footer: TextView
    private val ui = Handler(Looper.getMainLooper())
    /** Живая строка нагрузки у работающей ВМ */
    private var liveStats: TextView? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.decorView.setBackgroundColor(Ui.BG)
        window.statusBarColor = Ui.BG
        window.navigationBarColor = Ui.BG
        val root = Ui.vbox(this, 20)

        // Шапка
        val header = Ui.hbox(this)
        val titles = Ui.vbox(this, 0)
        titles.addView(Ui.title(this, "DroidVM", 28f))
        titles.addView(Ui.label(this, "Android внутри Android", 13f))
        header.addView(titles, Ui.weight())
        header.addView(Ui.iconAction(this, Icon.FOLDER, "Образы") { startActivity(Intent(this, ImagesActivity::class.java)) })
        header.addView(Ui.iconAction(this, Icon.LOG, "Журнал QEMU") { startActivity(Intent(this, LogActivity::class.java)) })
        root.addView(header)

        hero = Ui.card(this)
        root.addView(hero, Ui.lp(top = 20, ctx = this))

        val secRow = Ui.hbox(this)
        secRow.addView(Ui.sectionTitle(this, "МОИ МАШИНЫ"), Ui.weight())
        secRow.addView(Ui.button(this, "+ Новая") { newVm() }.apply { setPadding(dp(18), 0, dp(18), 0) })
        root.addView(secRow, Ui.lp(top = 28, ctx = this))

        list = Ui.vbox(this, 0)
        root.addView(list, Ui.lp(top = 12, ctx = this))

        root.addView(Ui.sectionTitle(this, "ДРУГИЕ ПРОШИВКИ (GSI)"), Ui.lp(top = 28, ctx = this))
        root.addView(buildCatalog(), Ui.lp(top = 12, ctx = this))

        footer = Ui.label(this, "", 12f)
        root.addView(footer, Ui.lp(top = 16, ctx = this))
        setContentView(ScrollView(this).apply { addView(root); isFillViewport = true; setBackgroundColor(Ui.BG) })

        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
        }
    }

    override fun onResume() {
        super.onResume()
        VmRunner.addListener(this)
        refresh()
        ui.post(ticker)
        // Проверка новой версии прошивки в фоне
        Thread { OsInstaller.latestCached(); runOnUiThread { if (!isFinishing) buildHero() } }.start()
    }

    override fun onPause() {
        ui.removeCallbacks(ticker)
        VmRunner.removeListener(this)
        super.onPause()
    }

    override fun onStateChanged(state: VmRunner.State) = refresh()

    /** Раз в 2 секунды обновляет нагрузку работающей ВМ. */
    private val ticker = object : Runnable {
        override fun run() {
            val tv = liveStats
            if (tv != null && VmRunner.state == VmRunner.State.RUNNING) {
                val pid = VmRunner.pid
                val st = if (pid > 0) VmStats.read(pid, VmRunner.startedAt) else null
                val up = (System.currentTimeMillis() - VmRunner.startedAt) / 1000
                val upText = String.format(Locale.US, "%d:%02d:%02d", up / 3600, up / 60 % 60, up % 60)
                tv.text = if (st != null) "Работает $upText · ЦП ${st.cpuPercent}% · ОЗУ ${humanSize(st.rssBytes)}" else "Работает $upText"
            }
            ui.postDelayed(this, 2000)
        }
    }

    private fun refresh() {
        buildHero()
        buildList()
        val mi = ActivityManager.MemoryInfo().also { (getSystemService(ACTIVITY_SERVICE) as ActivityManager).getMemoryInfo(it) }
        val free = VmStore.imagesDir(this).usableSpace
        val env = QemuEnv(this)
        footer.text = "Свободно: ОЗУ ${humanSize(mi.availMem)} из ${humanSize(mi.totalMem)} · память ${humanSize(free)} · ядер ${Runtime.getRuntime().availableProcessors()}" +
            if (!env.hasBinary(VmConfig.ARCH_ARM) || !env.hasBinary(VmConfig.ARCH_X86)) "\n" + env.status() else ""
    }

    private fun buildHero() {
        hero.removeAllViews()
        val top = Ui.hbox(this)
        top.addView(Ui.iconTile(this, Icon.ROBOT, sizeDp = 52))
        val t = Ui.vbox(this, 0)
        t.addView(Ui.title(this, "DroidVM OS", 19f))
        t.addView(Ui.label(this, "Android 16 · root (Magisk) · microG · F-Droid", 13f))
        top.addView(t, Ui.weight().apply { leftMargin = dp(14) })
        hero.addView(top)

        val installed = OsInstaller.installedVersions(this)
        val latest = OsInstaller.cached
        val chips = Ui.hbox(this)
        when {
            installed.isEmpty() && latest != null -> chips.addView(Ui.chip(this, "Доступна ${latest.tag} · ${humanSize(latest.total)}", Ui.INFO, Ui.INFO_SOFT))
            installed.isEmpty() -> chips.addView(Ui.chip(this, "Не установлена", Ui.MUTED, Ui.CARD2))
            latest != null && latest.tag > installed.first() -> {
                chips.addView(Ui.chip(this, "Установлена ${installed.first()}"))
                chips.addView(Ui.chip(this, "Обновление ${latest.tag}", Ui.WARN, Ui.WARN_SOFT).apply {
                    layoutParams = LinearLayout.LayoutParams(-2, -2).apply { leftMargin = dp(6) } })
            }
            else -> chips.addView(Ui.chip(this, "Установлена ${installed.first()} — последняя версия"))
        }
        hero.addView(chips, Ui.lp(top = 14, ctx = this))

        val needInstall = installed.isEmpty() || (latest != null && latest.tag > installed.first())
        val btn = Ui.button(this, when {
            installed.isEmpty() -> "Установить"
            needInstall -> "Обновить до ${latest!!.tag}"
            else -> "Переустановить"
        }, primary = needInstall) { installOs() }
        hero.addView(btn, Ui.lp(top = 14, ctx = this))
        if (needInstall) hero.addView(Ui.label(this, "Загрузка в несколько потоков, с докачкой. Распаковывать ничего не нужно.", 12f),
            Ui.lp(top = 8, ctx = this))
    }

    private fun buildList() {
        list.removeAllViews()
        liveStats = null
        val vms = VmStore.list(this)
        if (vms.isEmpty()) {
            val empty = Ui.card(this).apply { gravity = Gravity.CENTER_HORIZONTAL }
            empty.addView(Ui.iconTile(this, Icon.SCREEN, Ui.MUTED, Ui.CARD2, 56))
            empty.addView(Ui.title(this, "Здесь появятся ваши машины", 16f).apply { gravity = Gravity.CENTER }, Ui.lp(top = 12, ctx = this))
            empty.addView(Ui.label(this, "Установите DroidVM OS выше или создайте свою ВМ: ISO Android-x86/BlissOS или своя сборка AOSP под ARM64.", 13f)
                .apply { gravity = Gravity.CENTER }, Ui.lp(top = 6, ctx = this))
            list.addView(empty)
            return
        }
        for (vm in vms) {
            // Миграция ВМ DroidVM OS, созданных старой версией: экран 9:16
            if (vm.isArm && vm.name.startsWith("DroidVM OS") && vm.resolution.isBlank() && VmRunner.current?.id != vm.id) {
                vm.resolution = "720x1280"; vm.density = 320
                VmStore.save(this, vm)
            }
            list.addView(vmCard(vm), Ui.lp(ctx = this).apply { bottomMargin = dp(12) })
        }
    }

    private fun vmCard(vm: VmConfig): View {
        val running = VmRunner.current?.id == vm.id && VmRunner.isActive
        val saved = !running && VmRunner.hasState(this, vm)
        val card = Ui.card(this)
        val top = Ui.hbox(this)
        val tileFg = if (running) Ui.ACCENT else Ui.TEXT
        top.addView(Ui.iconTile(this, if (vm.name.startsWith("DroidVM OS")) Icon.ROBOT else Icon.SCREEN,
            tileFg, if (running) Ui.ACCENT_SOFT else Ui.CARD2))
        val t = Ui.vbox(this, 0)
        t.addView(Ui.title(this, vm.name, 16f).apply { maxLines = 1; ellipsize = TextUtils.TruncateAt.END })
        t.addView(Ui.label(this, vm.summary(), 12f))
        top.addView(t, Ui.weight().apply { leftMargin = dp(12) })
        top.addView(Ui.iconAction(this, Icon.MORE, "Ещё") { vmMenu(vm, running) })
        card.addView(top)

        when {
            running -> {
                val s = Ui.chip(this, "● ${stateText()}")
                card.addView(s, Ui.lp(-2, ctx = this, top = 12))
                if (VmRunner.state == VmRunner.State.RUNNING) liveStats = s
            }
            saved -> {
                val tm = java.text.SimpleDateFormat("d MMM, HH:mm", Locale("ru")).format(java.util.Date(VmRunner.stateTime(this, vm)))
                card.addView(Ui.chip(this, "Сохранено $tm · запуск за секунды", Ui.INFO, Ui.INFO_SOFT), Ui.lp(-2, ctx = this, top = 12))
            }
        }

        val row = Ui.hbox(this)
        when {
            running -> {
                row.addView(Ui.button(this, "Открыть экран", primary = true) { openScreen() }, Ui.weight())
                row.addView(Ui.iconAction(this, Icon.POWER, "Выключить") { VmRunner.powerDown(this) })
                row.addView(Ui.iconAction(this, Icon.STOP, "Остановить принудительно") {
                    AlertDialog.Builder(this).setTitle("Остановить «${vm.name}»?")
                        .setMessage("Как выдернуть шнур питания: несохранённые данные в госте пропадут.")
                        .setPositiveButton("Остановить") { _, _ -> VmRunner.kill(this) }.setNegativeButton("Отмена", null).show()
                })
            }
            saved -> {
                row.addView(Ui.button(this, "Продолжить", primary = true) { start(vm, resume = true) }, Ui.weight())
                row.addView(Ui.iconAction(this, Icon.EDIT, "Настроить") { edit(vm.id) })
            }
            else -> {
                row.addView(Ui.button(this, "Запустить", primary = true) { start(vm) }, Ui.weight())
                row.addView(Ui.iconAction(this, Icon.EDIT, "Настроить") { edit(vm.id) })
            }
        }
        card.addView(row, Ui.lp(top = 14, ctx = this))
        card.setOnLongClickListener { vmMenu(vm, running); true }
        return card
    }

    // ---------------- каталог GSI ----------------

    private fun buildCatalog(): View {
        val box = Ui.card(this)
        box.addView(Ui.label(this, "Готовые универсальные прошивки Android 16 для ARM64. Ставятся отдельной машиной поверх " +
            "DroidVM OS (её ядро и драйверы), со своим чистым диском данных. Самые свежие версии находятся автоматически.", 12f))
        for ((i, e) in GsiCatalog.entries.withIndex()) {
            val row = Ui.hbox(this)
            row.addView(Ui.iconTile(this, if (e.kind == GsiCatalog.Kind.GOOGLE) Icon.ROBOT else Icon.CHIP,
                if (e.kind == GsiCatalog.Kind.GOOGLE) Ui.INFO else Ui.TEXT, if (e.kind == GsiCatalog.Kind.GOOGLE) Ui.INFO_SOFT else Ui.CARD2, 40))
            val t = Ui.vbox(this, 0)
            t.addView(Ui.title(this, e.title, 14f))
            t.addView(Ui.label(this, e.about, 12f))
            row.addView(t, Ui.weight().apply { leftMargin = dp(12) })
            row.addView(Ui.iconAction(this, Icon.DOWNLOAD, "Скачать ${e.title}") { catalogInstall(e) })
            box.addView(row, Ui.lp(top = if (i == 0) 14 else 12, ctx = this))
        }
        box.addView(Ui.button(this, "Свой GSI из файла…") { localGsi() }, Ui.lp(top = 16, ctx = this))
        box.addView(Ui.label(this, "Подходят system.img и архивы .img.xz, .img.gz, .zip, .7z для arm64 (Android 16 и новее).", 12f),
            Ui.lp(top = 6, ctx = this))
        return box
    }

    private fun needBase(): Boolean {
        if (OsInstaller.installedVersions(this).isNotEmpty()) return false
        AlertDialog.Builder(this).setTitle("Сначала DroidVM OS")
            .setMessage("GSI запускается на ядре и драйверах DroidVM OS. Установите её (кнопка вверху), затем возвращайтесь к каталогу.")
            .setPositiveButton("Установить DroidVM OS") { _, _ -> installOs() }.setNegativeButton("Позже", null).show()
        return true
    }

    private fun catalogInstall(e: GsiCatalog.Entry) {
        if (needBase()) return
        if (e.licenseUrl != null) {
            AlertDialog.Builder(this).setTitle("Лицензия Google")
                .setMessage("Образ скачивается напрямую с серверов Google. Перед загрузкой нужно принять лицензионное соглашение " +
                    "Google для Android 16 GSI (бета-версия, только для разработки и тестирования).")
                .setNeutralButton("Прочитать") { _, _ -> startActivity(Intent(Intent.ACTION_VIEW, android.net.Uri.parse(e.licenseUrl))) }
                .setPositiveButton("Принимаю") { _, _ -> runGsi(e.title, e.homepage) { c, upd ->
                    upd(-1, "Ищу последнюю версию…")
                    val r = GsiCatalog.resolve(e)
                    GsiInstaller.install(this, "${e.title}", GsiInstaller.download(this, r, c, upd), true, c, upd)
                } }
                .setNegativeButton("Отмена", null).show()
            return
        }
        runGsi(e.title, e.homepage) { c, upd ->
            upd(-1, "Ищу последнюю версию…")
            val r = GsiCatalog.resolve(e)
            GsiInstaller.install(this, "${e.title} · ${r.version}", GsiInstaller.download(this, r, c, upd), true, c, upd)
        }
    }

    private fun localGsi() {
        if (needBase()) return
        importFromDevice { f ->
            runGsi(f.name) { c, upd -> GsiInstaller.install(this, f.name.substringBefore('.'), f, true, c, upd) }
        }
    }

    private fun runGsi(title: String, homepage: String? = null, job: (java.util.concurrent.atomic.AtomicBoolean, (Int, String) -> Unit) -> VmConfig) {
        if (VmRunner.isActive) { Ui.alert(this, "Сначала остановите машину", "Пока работает ВМ, телефону не хватит сил на распаковку прошивки."); return }
        val cancelled = java.util.concurrent.atomic.AtomicBoolean(false)
        val (dlg, upd) = Ui.progress(this, title) { cancelled.set(true) }
        Thread {
            val res = runCatching { job(cancelled, upd) }
            runOnUiThread {
                dlg.dismiss()
                refresh()
                res.onSuccess { vm ->
                    AlertDialog.Builder(this).setTitle("Готово")
                        .setMessage("Создана машина «${vm.name}».\n\nПервая загрузка GSI в эмуляции займёт несколько минут. " +
                            "Если система не стартует — значит, эта GSI несовместима; попробуйте другую из каталога.")
                        .setPositiveButton("Запустить") { _, _ -> start(vm) }.setNegativeButton("Позже", null).show()
                }.onFailure { e ->
                    if (e is InterruptedException) return@onFailure
                    val b = AlertDialog.Builder(this).setTitle("Не удалось установить").setMessage(
                        (e.message ?: e.toString()) + if (homepage != null) "\n\nМожно скачать прошивку вручную в браузере и поставить её кнопкой «Свой GSI из файла»." else "")
                        .setPositiveButton("OK", null)
                    if (homepage != null) b.setNeutralButton("Открыть страницу") { _, _ ->
                        startActivity(Intent(Intent.ACTION_VIEW, android.net.Uri.parse(homepage)))
                    }
                    b.show()
                }
            }
        }.start()
    }

    private fun vmMenu(vm: VmConfig, running: Boolean) {
        val items = mutableListOf<Pair<String, () -> Unit>>()
        if (!running) items += "Настроить" to { edit(vm.id) }
        if (!running && VmRunner.hasState(this, vm)) items += "Запустить заново (сбросить сохранённое)" to {
            AlertDialog.Builder(this).setTitle("Запустить заново?")
                .setMessage("Сохранённое состояние будет удалено, система загрузится с нуля.")
                .setPositiveButton("Заново") { _, _ -> start(vm) }.setNegativeButton("Отмена", null).show()
        }
        if (running) items += "Перезагрузить" to { VmRunner.reset(this) }
        if (vm.adbPort > 0 && vm.net != "none") items += "Скопировать команду ADB" to {
            getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("adb", "adb connect 127.0.0.1:${vm.adbPort}"))
            Toast.makeText(this, "Скопировано: adb connect 127.0.0.1:${vm.adbPort} (выполните в Termux)", Toast.LENGTH_LONG).show()
        }
        items += "Журнал и консоль" to { startActivity(Intent(this, LogActivity::class.java)) }
        items += "Команда QEMU" to { edit(vm.id, showCommand = true) }
        if (!running) items += "Удалить" to { delete(vm) }
        AlertDialog.Builder(this).setTitle(vm.name).setItems(items.map { it.first }.toTypedArray()) { _, i -> items[i].second() }.show()
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

    private fun edit(id: String, showCommand: Boolean = false) =
        startActivity(Intent(this, EditVmActivity::class.java).putExtra("id", id).putExtra("showCommand", showCommand))

    private fun delete(vm: VmConfig) {
        AlertDialog.Builder(this).setTitle("Удалить «${vm.name}»?")
            .setMessage("Удаляется только конфигурация. Файлы образов остаются в разделе «Образы».")
            .setPositiveButton("Удалить") { _, _ -> VmStore.delete(this, vm.id); refresh() }
            .setNegativeButton("Отмена", null).show()
    }

    private fun openScreen() = startActivity(Intent(this, ScreenActivity::class.java))

    private fun start(vm: VmConfig, resume: Boolean = false) {
        if (VmRunner.isActive) { Ui.alert(this, "Уже работает ВМ", "Сначала остановите «${VmRunner.current?.name}»."); return }
        val mi = ActivityManager.MemoryInfo().also { (getSystemService(ACTIVITY_SERVICE) as ActivityManager).getMemoryInfo(it) }
        val needBytes = vm.ramMb.toLong() * 1024 * 1024
        if (needBytes > mi.availMem) {
            AlertDialog.Builder(this).setTitle("Мало свободной памяти")
                .setMessage("ВМ просит ${vm.ramMb} МБ, а свободно ${humanSize(mi.availMem)}. Android может закрыть приложение. Запустить всё равно?")
                .setPositiveButton("Запустить") { _, _ -> doStart(vm, resume) }
                .setNegativeButton("Отмена", null).show()
        } else doStart(vm, resume)
    }

    private fun installOs() {
        val cancelled = java.util.concurrent.atomic.AtomicBoolean(false)
        val (dlg, upd) = Ui.progress(this, "DroidVM OS") { cancelled.set(true) }
        upd(-1, "Ищу последнюю версию…")
        Thread {
            val res = runCatching {
                val rel = OsInstaller.latest()
                runOnUiThread { dlg.setTitle("DroidVM OS ${rel.tag} · ${humanSize(rel.total)}") }
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

    private fun doStart(vm: VmConfig, resume: Boolean = false) {
        val (dlg, upd) = Ui.progress(this, "Запуск «${vm.name}»")
        upd(-1, if (resume) "Восстанавливаю сохранённое состояние…" else "Подготовка QEMU…")
        Thread {
            val err = runCatching { VmRunner.start(this, vm, resume) }.exceptionOrNull()
            runOnUiThread {
                dlg.dismiss()
                if (err != null) Ui.alert(this, "Не удалось запустить", err.message ?: err.toString())
                else openScreen()
                refresh()
            }
        }.start()
    }
}
