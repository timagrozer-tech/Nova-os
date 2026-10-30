package com.droidvm.app

import android.app.AlertDialog
import android.os.Bundle
import android.widget.LinearLayout
import android.widget.ScrollView
import com.droidvm.app.Ui.dp

/** Библиотека образов: ISO, img, qcow2, ядра, ramdisk. */
class ImagesActivity : ImageActivityBase() {

    private lateinit var list: LinearLayout

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.decorView.setBackgroundColor(Ui.BG)
        val root = Ui.vbox(this)
        root.addView(Ui.title(this, "Образы"))
        root.addView(Ui.label(this, "Папка: ${VmStore.imagesDir(this).absolutePath}\n" +
            "Сюда копируются импортированные файлы. Их можно выбрать в настройках любой ВМ.", 12f))
        val row = Ui.hbox(this)
        row.addView(Ui.button(this, "Импортировать…", primary = true) { importFromDevice { refresh() } }, Ui.weight())
        row.addView(Ui.button(this, "Пустой диск…") { createDiskDialog { refresh() } }, Ui.weight().apply { leftMargin = dp(8) })
        root.addView(row, Ui.lp(top = 12, ctx = this))
        list = Ui.vbox(this, 0)
        root.addView(list, Ui.lp(top = 12, ctx = this))
        setContentView(ScrollView(this).apply { addView(root) })
    }

    override fun onResume() { super.onResume(); refresh() }

    private fun refresh() {
        list.removeAllViews()
        val files = VmStore.images(this).filter { !it.name.endsWith(".part") }
        val dir = VmStore.imagesDir(this)
        list.addView(Ui.label(this, "Свободно: ${humanSize(dir.usableSpace)}", 12f))
        if (files.isEmpty()) list.addView(Ui.label(this, "\nПусто. Импортируйте ISO или образ диска.", 15f))
        for (f in files) {
            val card = Ui.card(this)
            card.addView(Ui.title(this, f.name, 15f))
            val users = VmStore.usersOf(this, f.absolutePath)
            card.addView(Ui.label(this, humanSize(f.length()) +
                if (users.isNotEmpty()) " · используется: " + users.joinToString { it.name } else ""))
            card.setOnLongClickListener { confirmDelete(f, users.map { it.name }); true }
            card.setOnClickListener { confirmDelete(f, users.map { it.name }) }
            list.addView(card, Ui.lp(top = 8, ctx = this))
        }
    }

    private fun confirmDelete(f: java.io.File, users: List<String>) {
        AlertDialog.Builder(this).setTitle(f.name)
            .setMessage("Удалить файл (${humanSize(f.length())})?" +
                if (users.isNotEmpty()) "\n\nОн используется ВМ: ${users.joinToString()}" else "")
            .setPositiveButton("Удалить") { _, _ -> f.delete(); refresh() }
            .setNegativeButton("Отмена", null).show()
    }
}
