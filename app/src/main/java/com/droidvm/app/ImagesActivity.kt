package com.droidvm.app

import android.app.AlertDialog
import android.content.Intent
import android.os.Bundle
import android.text.TextUtils
import android.view.Gravity
import android.view.View
import android.widget.CheckBox
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import com.droidvm.app.Icons.Icon
import com.droidvm.app.Ui.dp
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean

/** Все скачанные файлы: прошивки, GSI, ISO, образы, диски машин. Экспорт на USB OTG / в любую папку. */
class ImagesActivity : ImageActivityBase() {

    private data class Entry(val file: File, val rel: String, val title: String, val usedBy: List<String>)

    private lateinit var list: LinearLayout
    private lateinit var bar: TextView
    private lateinit var exportBtn: View
    private lateinit var deleteBtn: View
    private val selected = LinkedHashSet<File>()
    private var entries: List<Pair<String, List<Entry>>> = emptyList()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.decorView.setBackgroundColor(Ui.BG)
        window.statusBarColor = Ui.BG; window.navigationBarColor = Ui.BG
        val outer = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setBackgroundColor(Ui.BG) }
        val root = Ui.vbox(this, 20)
        root.addView(Ui.title(this, "Файлы", 26f))
        root.addView(Ui.label(this, "Всё, что скачано и создано в DroidVM. Отметьте файлы и скопируйте их на USB-флешку (OTG), " +
            "карту памяти или в любую папку.", 13f), Ui.lp(top = 4, ctx = this))
        val row = Ui.hbox(this)
        row.addView(Ui.button(this, "Импорт…") { importFromDevice { refresh() } }, Ui.weight())
        row.addView(Ui.button(this, "Пустой диск…") { createDiskDialog { refresh() } }, Ui.weight().apply { leftMargin = dp(8) })
        root.addView(row, Ui.lp(top = 14, ctx = this))
        list = Ui.vbox(this, 0)
        root.addView(list, Ui.lp(top = 8, ctx = this))
        outer.addView(ScrollView(this).apply { addView(root) }, LinearLayout.LayoutParams(-1, 0, 1f))

        // нижняя панель действий
        val actions = Ui.vbox(this, 12).apply { setBackgroundColor(Ui.CARD) }
        bar = Ui.label(this, "", 13f)
        actions.addView(bar)
        val ab = Ui.hbox(this)
        exportBtn = Ui.button(this, "Скопировать на USB / в папку…", primary = true) { pickTarget() }
        deleteBtn = Ui.iconAction(this, Icon.TRASH, "Удалить выбранное") { deleteSelected() }
        ab.addView(exportBtn, Ui.weight())
        ab.addView(deleteBtn)
        actions.addView(ab, Ui.lp(top = 8, ctx = this))
        outer.addView(actions)
        setContentView(outer)
    }

    override fun onResume() { super.onResume(); refresh() }

    private fun scan(): List<Pair<String, List<Entry>>> {
        val root = VmStore.imagesDir(this)
        val vms = VmStore.list(this)
        fun users(f: File) = vms.filter { vm -> (vm.disks + vm.iso + vm.kernel + vm.initrd).any { it == f.absolutePath } }.map { it.name }
        val skip = Regex("\\.(part|chunks|tmp)$")
        val groups = linkedMapOf<String, MutableList<Entry>>()
        fun add(group: String, f: File, rel: String) {
            groups.getOrPut(group) { mutableListOf() } += Entry(f, rel, f.name, users(f))
        }
        root.walkTopDown().filter { it.isFile && !skip.containsMatchIn(it.name) }.sortedBy { it.path.lowercase() }.forEach { f ->
            val rel = f.relativeTo(root).path.replace(File.separatorChar, '/')
            val top = rel.substringBefore('/', "")
            val group = when {
                top.startsWith("DroidVM-OS-") -> "DroidVM OS ${top.removePrefix("DroidVM-OS-")}"
                top == "GSI" -> if (rel.startsWith("GSI/base/")) "Основа для GSI" else "GSI"
                top == "NOVA-OS" -> "NOVA OS"
                top.isEmpty() -> "Образы"
                else -> top
            }
            add(group, f, "Образы/$rel")
        }
        // диски самих машин (лежат во внутренней памяти приложения)
        for (vm in vms) {
            val d = VmStore.vmDir(this, vm.id)
            d.listFiles()?.filter { it.isFile && (it.name.endsWith(".qcow2") || it.name == "config.json") }?.sortedBy { it.name }?.forEach {
                groups.getOrPut("Машина «${vm.name}»") { mutableListOf() } += Entry(it, "Машины/${vm.name.replace('/', '_')}/${it.name}", it.name, emptyList())
            }
        }
        return groups.map { it.key to it.value }
    }

    private fun refresh() {
        entries = scan()
        val existing = entries.flatMap { g -> g.second.map { it.file } }.toSet()
        selected.retainAll(existing)
        list.removeAllViews()
        val free = VmStore.imagesDir(this).usableSpace
        list.addView(Ui.label(this, "Свободно на телефоне: ${humanSize(free)}", 12f), Ui.lp(top = 8, ctx = this))
        if (entries.isEmpty()) {
            list.addView(Ui.label(this, "\nПока пусто. Установите DroidVM OS, прошивку из каталога или импортируйте образ.", 14f))
        }
        for ((group, items) in entries) {
            val card = Ui.card(this)
            val head = Ui.hbox(this)
            head.addView(Ui.title(this, group, 15f).apply { maxLines = 1; ellipsize = TextUtils.TruncateAt.END }, Ui.weight())
            head.addView(Ui.label(this, humanSize(items.sumOf { it.file.length() }), 12f))
            val all = CheckBox(this).apply {
                isChecked = items.all { it.file in selected }
                buttonTintList = android.content.res.ColorStateList.valueOf(Ui.ACCENT)
                setOnClickListener { if (isChecked) items.forEach { selected += it.file } else items.forEach { selected -= it.file }; refresh() }
                contentDescription = "Выбрать всю группу"
            }
            head.addView(all)
            card.addView(head)
            for (e in items) {
                val r = Ui.hbox(this)
                val t = Ui.vbox(this, 0)
                t.addView(TextView(this).apply {
                    text = e.title; textSize = 13f; setTextColor(Ui.TEXT); maxLines = 2; ellipsize = TextUtils.TruncateAt.MIDDLE
                })
                val big = e.file.length() > Exporter.FAT32_LIMIT
                t.addView(Ui.label(this, humanSize(e.file.length()) +
                    (if (e.usedBy.isNotEmpty()) " · в машине: " + e.usedBy.joinToString() else "") +
                    (if (big) " · больше 4 ГБ — нужна флешка exFAT" else ""), 11f, if (big) Ui.WARN else Ui.MUTED))
                r.addView(t, Ui.weight())
                val cb = CheckBox(this).apply {
                    isChecked = e.file in selected
                    buttonTintList = android.content.res.ColorStateList.valueOf(Ui.ACCENT)
                    setOnCheckedChangeListener { _, v -> if (v) selected += e.file else selected -= e.file; updateBar() }
                }
                r.addView(cb)
                r.setOnClickListener { cb.isChecked = !cb.isChecked }
                r.setOnLongClickListener { fileMenu(e); true }
                card.addView(r, Ui.lp(top = 10, ctx = this))
            }
            list.addView(card, Ui.lp(top = 12, ctx = this))
        }
        updateBar()
    }

    private fun updateBar() {
        val bytes = selected.sumOf { it.length() }
        bar.text = if (selected.isEmpty()) "Отметьте файлы галочками. Долгое нажатие — меню файла."
        else "Выбрано: ${selected.size} · ${humanSize(bytes)}"
        exportBtn.isEnabled = selected.isNotEmpty(); exportBtn.alpha = if (selected.isEmpty()) 0.5f else 1f
        deleteBtn.isEnabled = selected.isNotEmpty(); deleteBtn.alpha = if (selected.isEmpty()) 0.4f else 1f
    }

    private fun fileMenu(e: Entry) {
        AlertDialog.Builder(this).setTitle(e.title)
            .setItems(arrayOf("Скопировать на USB / в папку…", "Удалить")) { _, i ->
                when (i) {
                    0 -> { selected.clear(); selected += e.file; updateBar(); pickTarget() }
                    1 -> { selected.clear(); selected += e.file; deleteSelected() }
                }
            }.show()
    }

    // ---------- экспорт ----------

    private fun pickTarget() {
        if (selected.isEmpty()) return
        if (VmRunner.isActive && selected.any { f -> VmRunner.current?.let { cfg -> cfg.disks.contains(f.absolutePath) || f.absolutePath.startsWith(VmStore.vmDir(this, cfg.id).absolutePath) } == true }) {
            Ui.alert(this, "Машина работает", "Диски работающей машины меняются прямо сейчас — копия получится повреждённой. Остановите или сохраните машину и повторите.")
            return
        }
        val big = selected.filter { it.length() > Exporter.FAT32_LIMIT }
        val go = {
            startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).addFlags(
                Intent.FLAG_GRANT_WRITE_URI_PERMISSION or Intent.FLAG_GRANT_READ_URI_PERMISSION), REQ_TREE)
            android.widget.Toast.makeText(this, "Выберите флешку (USB) или папку — нажмите ☰ слева вверху, если её не видно", android.widget.Toast.LENGTH_LONG).show()
        }
        if (big.isNotEmpty()) {
            AlertDialog.Builder(this).setTitle("Файлы больше 4 ГБ")
                .setMessage("${big.joinToString { it.name }} — больше 4 ГБ. На флешку в формате FAT32 такие файлы не записываются; " +
                    "нужен формат exFAT (или NTFS). Продолжить?")
                .setPositiveButton("Продолжить") { _, _ -> go() }.setNegativeButton("Отмена", null).show()
        } else go()
    }

    @Deprecated("Activity API")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        @Suppress("DEPRECATION")
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != REQ_TREE || resultCode != RESULT_OK) return
        val tree = data?.data ?: return
        val byFile = entries.flatMap { it.second }.associateBy { it.file }
        val items = selected.mapNotNull { f -> byFile[f]?.let { Exporter.Item(f, it.rel) } }
        val cancelled = AtomicBoolean(false)
        val (dlg, upd) = Ui.progress(this, "Копирование (${items.size})") { cancelled.set(true) }
        Thread {
            val r = runCatching { Exporter.copyToTree(this, tree, items, cancelled, upd) }
            runOnUiThread {
                dlg.dismiss()
                r.onSuccess {
                    Ui.alert(this, "Готово", "Скопировано ${items.size} файл(ов), ${humanSize(items.sumOf { it.file.length() })}, в папку «DroidVM …» на выбранном носителе.\n\n" +
                        "Перед тем как вынуть флешку, дождитесь, пока Android закончит запись (Настройки → Хранилище → Извлечь).")
                }.onFailure { e -> if (e !is InterruptedException) Ui.alert(this, "Не удалось скопировать", e.message ?: e.toString()) }
            }
        }.start()
    }

    private fun deleteSelected() {
        if (selected.isEmpty()) return
        val used = selected.filter { f -> VmStore.list(this).any { vm -> vm.disks.contains(f.absolutePath) || vm.iso == f.absolutePath } || f.path.contains("/vms/") }
        AlertDialog.Builder(this).setTitle("Удалить ${selected.size} файл(ов)?")
            .setMessage("Освободится ${humanSize(selected.sumOf { it.length() })}." +
                if (used.isNotEmpty()) "\n\nВнимание: ${used.size} из них используются машинами — эти машины перестанут запускаться." else "")
            .setPositiveButton("Удалить") { _, _ ->
                if (VmRunner.isActive && used.isNotEmpty()) { Ui.alert(this, "Машина работает", "Сначала остановите машину."); return@setPositiveButton }
                selected.forEach { it.delete() }; selected.clear(); refresh()
            }.setNegativeButton("Отмена", null).show()
    }

    companion object { const val REQ_TREE = 5151 }
}
