package com.droidvm.app

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.view.inputmethod.InputMethodManager
import android.widget.Button
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.LinearLayout
import android.widget.TextView
import com.droidvm.app.Ui.dp

/** Экран виртуальной машины. */
class ScreenActivity : Activity(), RfbClient.Callback, VmRunner.Listener {

    private lateinit var vnc: VncView
    private lateinit var overlay: TextView
    private lateinit var bar: View
    private var client: RfbClient? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; setBackgroundColor(Color.BLACK) }
        val frame = FrameLayout(this)
        vnc = VncView(this)
        frame.addView(vnc, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        overlay = TextView(this).apply {
            setTextColor(Color.WHITE); textSize = 15f; gravity = Gravity.CENTER
            setBackgroundColor(0xAA000000.toInt()); val p = dp(16); setPadding(p, p, p, p)
        }
        frame.addView(overlay, FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER))
        root.addView(frame, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        bar = buildToolbar()
        root.addView(bar)
        setContentView(root)
        hideSystemUi()
    }

    private fun buildToolbar(): View {
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL; setBackgroundColor(0xFF15181C.toInt())
            val p = dp(4); setPadding(p, p, p, p)
        }
        fun btn(text: String, action: () -> Unit) {
            val b = Button(this).apply {
                this.text = text; isAllCaps = false; textSize = 13f; setTextColor(Color.WHITE)
                setBackgroundColor(Color.TRANSPARENT); minWidth = dp(48); minimumWidth = dp(48)
                setOnClickListener { action() }
            }
            row.addView(b)
        }
        btn("⌨") { toggleKeyboard() }
        btn("◁ Назад") { client?.tap(KeyMap.BACK) }
        btn("○ Домой") { client?.tap(KeyMap.HOME) }
        btn("▢ Недавние") { client?.combo(KeyMap.ALT, KeyMap.TAB) }
        btn("Esc") { client?.tap(KeyMap.ESC) }
        btn("⏻") { client?.tap(KeyMap.POWER) }
        btn("🔉") { client?.tap(KeyMap.VOL_DOWN) }
        btn("🔊") { client?.tap(KeyMap.VOL_UP) }
        btn("⋮ Меню") { showMenu() }
        return HorizontalScrollView(this).apply { addView(row); isHorizontalScrollBarEnabled = false }
    }

    private fun showMenu() {
        val items = arrayOf(
            if (vnc.stretch) "Вписать с сохранением пропорций" else "Растянуть на весь экран",
            "Ctrl+Alt+Del", "Перезагрузить ВМ (reset)", "Выключить (ACPI)", "Остановить принудительно",
            "Журнал QEMU", "Свернуть (ВМ продолжит работу)",
        )
        AlertDialog.Builder(this).setItems(items) { _, i ->
            when (i) {
                0 -> vnc.stretch = !vnc.stretch
                1 -> client?.combo(KeyMap.CTRL, KeyMap.ALT, KeyMap.Key(0xffff, 0xd3))
                2 -> VmRunner.reset(this)
                3 -> VmRunner.powerDown(this)
                4 -> AlertDialog.Builder(this).setTitle("Остановить ВМ?")
                    .setMessage("Это как выдернуть шнур питания — несохранённые данные в госте пропадут.")
                    .setPositiveButton("Остановить") { _, _ -> VmRunner.kill(this) }
                    .setNegativeButton("Отмена", null).show()
                5 -> startActivity(Intent(this, LogActivity::class.java))
                6 -> finish()
            }
        }.show()
    }

    private fun toggleKeyboard() {
        val imm = getSystemService(InputMethodManager::class.java)
        vnc.requestFocus()
        @Suppress("DEPRECATION")
        imm.toggleSoftInput(InputMethodManager.SHOW_FORCED, 0)
    }

    @Suppress("DEPRECATION")
    private fun hideSystemUi() {
        if (Build.VERSION.SDK_INT >= 30) {
            window.insetsController?.let {
                it.hide(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
                it.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_FULLSCREEN or
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        }
    }

    override fun onResume() {
        super.onResume()
        VmRunner.addListener(this)
        connect()
    }

    override fun onPause() {
        VmRunner.removeListener(this)
        client?.close(); client = null
        vnc.client = null
        super.onPause()
    }

    private fun connect() {
        if (!VmRunner.isActive) {
            showOverlay("ВМ не запущена.\n${VmRunner.lastExitCode?.let { "QEMU завершился с кодом $it — смотрите «Журнал»." } ?: ""}")
            return
        }
        showOverlay("Подключение к экрану ВМ…")
        val c = RfbClient(QemuEnv(this).vncSocket.absolutePath, this)
        client = c
        vnc.client = c
        c.start()
    }

    private fun showOverlay(text: String?) = runOnUiThread {
        if (text == null) overlay.visibility = View.GONE
        else { overlay.text = text; overlay.visibility = View.VISIBLE }
    }

    // RfbClient.Callback
    override fun onConnected(width: Int, height: Int, name: String) {
        showOverlay(null)
        vnc.postInvalidate()
    }
    override fun onFrame() = vnc.postInvalidate()
    override fun onResize(width: Int, height: Int) = vnc.postInvalidate()
    override fun onDisconnected(error: String?) {
        if (error != null) showOverlay("Экран отключён: $error")
    }

    // VmRunner.Listener
    override fun onStateChanged(state: VmRunner.State) {
        if (state == VmRunner.State.IDLE) {
            showOverlay("ВМ остановлена" + (VmRunner.lastExitCode?.let { " (код $it)" } ?: ""))
        }
    }

    @Deprecated("Activity API")
    override fun onBackPressed() {
        // Системная «Назад» телефона работает как «Назад» в гостевом Android.
        if (client != null && VmRunner.isActive) client?.tap(KeyMap.BACK) else super.onBackPressed()
    }
}
