package com.droidvm.app

import android.app.AlertDialog
import android.os.Bundle
import android.text.InputType
import android.view.View
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import com.droidvm.app.Ui.dp
import java.io.File

/** Редактор конфигурации ВМ. */
class EditVmActivity : ImageActivityBase() {

    private lateinit var cfg: VmConfig
    private val refreshers = mutableListOf<() -> Unit>()
    private lateinit var form: LinearLayout

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.decorView.setBackgroundColor(Ui.BG)
        cfg = VmStore.get(this, intent.getStringExtra("id") ?: "") ?: run { finish(); return }

        form = Ui.vbox(this)
        form.addView(Ui.title(this, "Настройки ВМ"))

        section("Профиль мощности")
        val presets = Ui.hbox(this)
        val cores = Runtime.getRuntime().availableProcessors()
        val am = getSystemService(android.app.ActivityManager::class.java)
        val totalMb = (android.app.ActivityManager.MemoryInfo().also { am.getMemoryInfo(it) }.totalMem / 1048576).toInt()
        fun preset(name: String, ram: Int, cpu: Int, tb: Int) = Ui.button(this, name) {
            cfg.ramMb = ram; cfg.cpus = cpu.coerceIn(1, cores); cfg.tbSizeMb = tb
            save(); recreate()
            android.widget.Toast.makeText(this, "$name: ${cfg.ramMb} МБ · ${cfg.cpus} ЦП", android.widget.Toast.LENGTH_SHORT).show()
        }
        presets.addView(preset("Экономно", 2048, 2, 256), Ui.weight())
        presets.addView(preset("Баланс", minOf(3072, totalMb / 2 / 256 * 256).coerceAtLeast(2048), 4, 512), Ui.weight().apply { leftMargin = dp(6) })
        presets.addView(preset("Максимум", minOf(6144, totalMb * 6 / 10 / 256 * 256).coerceAtLeast(2048), cores - 1, 1024), Ui.weight().apply { leftMargin = dp(6) })
        form.addView(presets, Ui.lp(top = 8, ctx = this))
        form.addView(Ui.label(this, "Память, ядра процессора и кэш трансляции подбираются под этот телефон. Тонкая настройка — ниже.", 12f), Ui.lp(top = 6, ctx = this))

        section("Основное")
        textField("Название", cfg.name, InputType.TYPE_CLASS_TEXT) { cfg.name = it.ifBlank { "ВМ" } }
        choice("Архитектура гостя", listOf(
            VmConfig.ARCH_X86 to "x86_64 (Android-x86, BlissOS, PrimeOS…)",
            VmConfig.ARCH_ARM to "ARM64 (AOSP, GSI, сборки под arm64)",
        ), { cfg.arch }) { v ->
            cfg.arch = v
            if (cfg.isArm) {
                if (cfg.bootMode == VmConfig.BOOT_BIOS) cfg.bootMode = VmConfig.BOOT_UEFI
                if (cfg.gpu == "std") cfg.gpu = "virtio"
                cfg.diskIface = "virtio"
            } else if (cfg.gpu == "ramfb") cfg.gpu = "std"
        }
        textField("Память, МБ", cfg.ramMb.toString(), InputType.TYPE_CLASS_NUMBER) { cfg.ramMb = it.toIntOrNull()?.coerceIn(256, 65536) ?: cfg.ramMb }
        textField("Ядер процессора", cfg.cpus.toString(), InputType.TYPE_CLASS_NUMBER) {
            cfg.cpus = it.toIntOrNull()?.coerceIn(1, Runtime.getRuntime().availableProcessors()) ?: cfg.cpus
        }

        section("Загрузка")
        choice("Способ загрузки", listOf(
            VmConfig.BOOT_BIOS to "BIOS (SeaBIOS) — ISO или диск, только x86",
            VmConfig.BOOT_UEFI to "UEFI (EDK2) — ISO или диск",
            VmConfig.BOOT_KERNEL to "Ядро + ramdisk напрямую (своя сборка AOSP)",
        ), { cfg.bootMode }) { cfg.bootMode = if (cfg.isArm && it == VmConfig.BOOT_BIOS) VmConfig.BOOT_UEFI else it }
        val notKernel = { cfg.bootMode != VmConfig.BOOT_KERNEL }
        val isKernel = { cfg.bootMode == VmConfig.BOOT_KERNEL }
        fileField("ISO-образ (CD)", false, { cfg.iso }) { cfg.iso = it }
        check("Загружаться с ISO (снимите после установки на диск)", { cfg.bootFromIso }, notKernel) { cfg.bootFromIso = it }
        fileField("Ядро (bzImage / Image / kernel)", false, { cfg.kernel }, isKernel) { cfg.kernel = it }
        fileField("Ramdisk / initrd (ramdisk.img, initrd.img)", false, { cfg.initrd }, isKernel) { cfg.initrd = it }
        textField("Командная строка ядра", cfg.cmdline, InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE, isKernel) { cfg.cmdline = it }

        section("Диски")
        for (i in 0 until 3) fileField("Диск ${i + 1}" + if (i == 0) " (system / основной)" else "", true, { cfg.disks[i] }) { cfg.disks[i] = it }
        choice("Интерфейс дисков", listOf(
            "sata" to "SATA/IDE — совместимо с установщиком Android-x86",
            "virtio" to "virtio-blk — быстрее, нужен драйвер в ядре",
        ), { cfg.diskIface }, { !cfg.isArm }) { cfg.diskIface = it }
        check("Не сохранять изменения дисков (-snapshot)", { cfg.snapshot }) { cfg.snapshot = it }

        section("Устройства")
        choice("Чипсет", listOf("q35" to "Q35 (современный)", "pc" to "i440FX (старый, максимум совместимости)"),
            { cfg.machine }, { !cfg.isArm }) { cfg.machine = it }
        choice("Видео", listOf(
            "std" to "Стандартная VGA (x86, надёжно)",
            "virtio" to "virtio-gpu (нужен драйвер virtio в сборке)",
            "ramfb" to "ramfb (простой кадровый буфер, ARM)",
        ), { cfg.gpu }) { cfg.gpu = it }
        choice("Разрешение экрана гостя", listOf(
            "720x1280" to "720×1280 · 9:16, телефон (рекомендуется)",
            "1080x1920" to "1080×1920 · 9:16, Full HD (медленнее)",
            "600x1024" to "600×1024 · компактно и быстро",
            "1280x720" to "1280×720 · 16:9, альбомная",
            "1280x800" to "1280×800 · 16:10, планшет",
            "" to "По умолчанию (решает гостевая система)",
        ), { cfg.resolution }, { cfg.gpu == "virtio" || cfg.isArm }) { cfg.resolution = it }
        choice("Ввод (сенсор/клавиатура)", listOf(
            "usb" to "USB-планшет + USB-клавиатура",
            "virtio" to "virtio-tablet + virtio-keyboard",
        ), { cfg.input }) { cfg.input = it }
        choice("Управление касаниями", listOf(
            "touch" to "Сенсор — касание попадает в точку (Android)",
            "touchpad" to "Тачпад — как на ноутбуке (настольные системы)",
        ), { cfg.pointer }) { cfg.pointer = it }
        check("Общая папка «телефон → ВМ» (USB-флешка в госте, до ~500 МБ)", { cfg.shareFolder }) { cfg.shareFolder = it }
        choice("Сеть", listOf(
            "virtio" to "virtio-net",
            "e1000" to "Intel e1000 (совместимость)",
            "none" to "Без сети",
        ), { cfg.net }) { cfg.net = it }
        textField("Порт ADB на телефоне (→ 5555 гостя, 0 = выкл.)", cfg.adbPort.toString(), InputType.TYPE_CLASS_NUMBER) {
            cfg.adbPort = it.toIntOrNull()?.coerceIn(0, 65535) ?: 0
        }

        section("Производительность и экспертные настройки")
        check("Многопоточная эмуляция (MTTCG)", { cfg.multiThread }) { cfg.multiThread = it }
        textField("Кэш трансляции, МБ (tb-size)", cfg.tbSizeMb.toString(), InputType.TYPE_CLASS_NUMBER) {
            cfg.tbSizeMb = it.toIntOrNull()?.coerceIn(32, 2048) ?: cfg.tbSizeMb
        }
        textField("Дополнительные аргументы QEMU", cfg.extraArgs, InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE) { cfg.extraArgs = it }

        val btns = Ui.hbox(this)
        btns.addView(Ui.button(this, "Команда QEMU") { showCommand() }, Ui.weight())
        btns.addView(Ui.button(this, "Сохранить", primary = true) { save(); finish() }, Ui.weight().apply { leftMargin = dp(8) })
        form.addView(btns, Ui.lp(top = 20, ctx = this))

        setContentView(ScrollView(this).apply { addView(form); setBackgroundColor(Ui.BG) })
        refreshAll()
        if (intent.getBooleanExtra("showCommand", false)) showCommand()
    }

    override fun onPause() { super.onPause(); save() }

    private fun save() = VmStore.save(this, cfg)

    private fun refreshAll() = refreshers.forEach { it() }

    private fun section(t: String) {
        form.addView(Ui.label(this, t.uppercase(), 13f, Ui.ACCENT), Ui.lp(top = 22, ctx = this))
    }

    private fun wrap(label: String, visible: () -> Boolean, content: View): LinearLayout {
        val box = Ui.vbox(this, 0)
        box.addView(Ui.label(this, label), Ui.lp(top = 10, ctx = this))
        box.addView(content)
        form.addView(box)
        refreshers += { box.visibility = if (visible()) View.VISIBLE else View.GONE }
        return box
    }

    private fun textField(label: String, value: String, type: Int, visible: () -> Boolean = { true }, set: (String) -> Unit) {
        val et = EditText(this).apply {
            setText(value); inputType = type; setTextColor(0xFFFFFFFF.toInt())
            addTextChangedListener(object : android.text.TextWatcher {
                override fun beforeTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
                override fun onTextChanged(s: CharSequence?, a: Int, b: Int, c: Int) {}
                override fun afterTextChanged(s: android.text.Editable?) { set(s?.toString() ?: "") }
            })
        }
        wrap(label, visible, et)
    }

    private fun check(label: String, get: () -> Boolean, visible: () -> Boolean = { true }, set: (Boolean) -> Unit) {
        val cb = CheckBox(this).apply {
            text = label; setTextColor(0xFFFFFFFF.toInt()); isChecked = get()
            setOnCheckedChangeListener { _, v -> set(v) }
        }
        form.addView(cb, Ui.lp(top = 6, ctx = this))
        refreshers += { cb.visibility = if (visible()) View.VISIBLE else View.GONE; cb.isChecked = get() }
    }

    private fun choice(label: String, options: List<Pair<String, String>>, get: () -> String,
                       visible: () -> Boolean = { true }, set: (String) -> Unit) {
        val b = Ui.button(this, "") {}
        b.gravity = android.view.Gravity.START or android.view.Gravity.CENTER_VERTICAL
        b.setOnClickListener {
            AlertDialog.Builder(this).setTitle(label)
                .setSingleChoiceItems(options.map { it.second }.toTypedArray(), options.indexOfFirst { it.first == get() }) { d, i ->
                    set(options[i].first); d.dismiss(); refreshAll()
                }.show()
        }
        wrap(label, visible, b)
        refreshers += { b.text = options.firstOrNull { it.first == get() }?.second ?: get() }
    }

    private fun fileField(label: String, isDisk: Boolean, get: () -> String, visible: () -> Boolean = { true }, set: (String) -> Unit) {
        val b: Button = Ui.button(this, "") {}
        b.gravity = android.view.Gravity.START or android.view.Gravity.CENTER_VERTICAL
        b.setOnClickListener { pickFile(label, isDisk) { set(it); refreshAll() } }
        wrap(label, visible, b)
        refreshers += {
            val p = get()
            b.text = when {
                p.isBlank() -> "— не выбрано —"
                File(p).exists() -> "${File(p).name}  (${humanSize(File(p).length())})"
                else -> "⚠ нет файла: ${File(p).name}"
            }
        }
    }

    private fun pickFile(title: String, isDisk: Boolean, set: (String) -> Unit) {
        val files = VmStore.images(this).filter { !it.name.endsWith(".part") }
        val items = mutableListOf<String>()
        val actions = mutableListOf<() -> Unit>()
        items += "📥 Импортировать с телефона…"; actions += { importFromDevice { set(it.absolutePath) } }
        if (isDisk) { items += "➕ Создать пустой диск…"; actions += { createDiskDialog { set(it.absolutePath) } } }
        items += "✖ Не использовать"; actions += { set("") }
        for (f in files) { items += "${f.name}  ·  ${humanSize(f.length())}"; actions += { set(f.absolutePath) } }
        AlertDialog.Builder(this).setTitle(title).setItems(items.toTypedArray()) { _, i -> actions[i]() }.show()
    }

    private fun showCommand() {
        save()
        val text = runCatching {
            QemuCommand.pretty(QemuCommand.build(QemuEnv(this), cfg, VmStore.vmDir(this, cfg.id)))
        }.getOrElse { "Ошибка: ${it.message}" }
        val tv = TextView(this).apply {
            this.text = text; setTextIsSelectable(true); textSize = 12f
            typeface = android.graphics.Typeface.MONOSPACE; val p = dp(16); setPadding(p, p, p, p)
        }
        AlertDialog.Builder(this).setTitle("Команда запуска").setView(ScrollView(this).apply { addView(tv) })
            .setPositiveButton("OK", null).show()
    }
}
