package com.droidvm.app

import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.graphics.Typeface
import android.os.Bundle
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import com.droidvm.app.Ui.dp
import java.io.File

/** Журнал QEMU и вывод последовательной консоли гостя (ядро, init). */
class LogActivity : Activity(), VmRunner.Listener {

    private lateinit var text: TextView
    private lateinit var scroll: ScrollView
    private var serial = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.decorView.setBackgroundColor(Ui.BG)
        val root = Ui.vbox(this, 12)
        val row = Ui.hbox(this)
        row.addView(Ui.button(this, "QEMU") { serial = false; reload() }, Ui.weight())
        row.addView(Ui.button(this, "Консоль гостя") { serial = true; reload() }, Ui.weight().apply { leftMargin = dp(6) })
        row.addView(Ui.button(this, "Копировать") {
            getSystemService(ClipboardManager::class.java).setPrimaryClip(ClipData.newPlainText("log", text.text))
            Toast.makeText(this, "Скопировано", Toast.LENGTH_SHORT).show()
        }, Ui.weight().apply { leftMargin = dp(6) })
        root.addView(row)
        text = TextView(this).apply {
            typeface = Typeface.MONOSPACE; textSize = 11f; setTextColor(0xFFD0D6DC.toInt()); setTextIsSelectable(true)
        }
        scroll = ScrollView(this).apply { addView(text) }
        root.addView(scroll, Ui.lp(h = 0, top = 8, ctx = this).apply { weight = 1f })
        setContentView(root)
    }

    override fun onResume() { super.onResume(); VmRunner.addListener(this); reload() }
    override fun onPause() { VmRunner.removeListener(this); super.onPause() }

    private fun reload() {
        text.text = if (serial) {
            val id = VmRunner.lastVmId
            val f = if (id != null) File(VmStore.vmDir(this, id), "serial.log") else null
            when {
                f == null -> "ВМ ещё не запускалась."
                !f.exists() -> "Консоль пуста. Для вывода ядра добавьте в командную строку ядра console=ttyS0 (x86) или console=ttyAMA0 (ARM)."
                else -> f.readText().takeLast(200_000)
            }
        } else VmRunner.logText().ifBlank { "Журнал пуст." }
        scroll.post { scroll.fullScroll(ScrollView.FOCUS_DOWN) }
    }

    override fun onLog(line: String) {
        if (!serial) { text.append("\n" + line); scroll.post { scroll.fullScroll(ScrollView.FOCUS_DOWN) } }
    }
}
