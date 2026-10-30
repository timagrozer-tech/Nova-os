package com.droidvm.app

import android.app.Activity
import android.app.AlertDialog
import android.content.ContentValues
import android.content.Intent
import android.content.pm.ActivityInfo
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.view.inputmethod.InputMethodManager
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import com.droidvm.app.Icons.Icon
import com.droidvm.app.Ui.dp
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Экран виртуальной машины с плавающей панелью управления. */
class ScreenActivity : Activity(), RfbClient.Callback, VmRunner.Listener {

    private lateinit var vnc: VncView
    private lateinit var overlay: TextView
    private lateinit var bootPill: TextView
    private lateinit var panel: LinearLayout
    private lateinit var extras: LinearLayout
    private lateinit var mainBar: LinearLayout
    private lateinit var handle: View
    private lateinit var moreBtn: IconButton
    private lateinit var rotateBtn: IconButton
    private var client: RfbClient? = null
    private val ui = Handler(Looper.getMainLooper())
    /** null — ориентация по экрану гостя; иначе выбранная вручную */
    private var forcedOrientation: Int? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        val root = FrameLayout(this).apply { setBackgroundColor(Color.BLACK) }
        vnc = VncView(this)
        root.addView(vnc, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))

        overlay = TextView(this).apply {
            setTextColor(Color.WHITE); textSize = 15f; gravity = Gravity.CENTER
            background = pill(0xCC000000.toInt()); val p = dp(16); setPadding(p, p, p, p)
        }
        root.addView(overlay, FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER))

        bootPill = TextView(this).apply {
            setTextColor(0xFFEDEFF2.toInt()); textSize = 13f; gravity = Gravity.CENTER
            background = pill(0xCC15181C.toInt()); setPadding(dp(14), dp(8), dp(14), dp(8)); visibility = View.GONE
        }
        root.addView(bootPill, FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT,
            Gravity.TOP or Gravity.CENTER_HORIZONTAL).apply { topMargin = dp(24) })

        root.addView(buildPanel(), FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT,
            Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL).apply { bottomMargin = dp(10) })
        setContentView(root)
        hideSystemUi()
    }

    private fun pill(color: Int) = GradientDrawable().apply { cornerRadius = dp(26).toFloat(); setColor(color) }

    private fun row() = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER
        background = pill(0xE015181C.toInt()); setPadding(dp(6), dp(2), dp(6), dp(2))
    }

    private fun LinearLayout.icon(i: Icon, label: String, action: () -> Unit) =
        IconButton(this@ScreenActivity, i, label, action).also { addView(it) }

    private fun buildPanel(): View {
        panel = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL }

        extras = row().apply { visibility = View.GONE }
        extras.icon(Icon.POWER, "Кнопка питания") { client?.tap(KeyMap.POWER) }
        extras.icon(Icon.VOL_DOWN, "Тише") { client?.tap(KeyMap.VOL_DOWN) }
        extras.icon(Icon.VOL_UP, "Громче") { client?.tap(KeyMap.VOL_UP) }
        rotateBtn = extras.icon(Icon.ROTATE, "Повернуть экран") { rotate() }
        extras.icon(Icon.CAMERA, "Скриншот") { screenshot() }
        extras.icon(Icon.SAVE, "Сохранить состояние и выйти") { saveState() }
        extras.icon(Icon.MORE, "Ещё") { showMenu() }
        panel.addView(extras, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { bottomMargin = dp(8) })

        mainBar = row()
        mainBar.icon(Icon.KEYBOARD, "Клавиатура") { toggleKeyboard() }
        mainBar.icon(Icon.BACK, "Назад") { client?.tap(KeyMap.BACK) }
        mainBar.icon(Icon.HOME, "Домой") { client?.tap(KeyMap.HOME) }
        mainBar.icon(Icon.RECENTS, "Недавние") { client?.combo(KeyMap.ALT, KeyMap.TAB) }
        moreBtn = mainBar.icon(Icon.SHOW, "Дополнительно") { toggleExtras() }
        mainBar.icon(Icon.HIDE, "Свернуть панель") { collapse(true) }
        panel.addView(mainBar)

        // Свёрнутая панель — маленький «язычок» внизу
        handle = View(this).apply {
            background = GradientDrawable().apply { cornerRadius = dp(3).toFloat(); setColor(0x99EDEFF2.toInt()) }
            visibility = View.GONE
        }
        val handleBox = FrameLayout(this).apply {
            addView(handle, FrameLayout.LayoutParams(dp(56), dp(5), Gravity.CENTER))
            setOnClickListener { collapse(false) }
            contentDescription = "Показать панель"
        }
        panel.addView(handleBox, LinearLayout.LayoutParams(dp(120), dp(28)))
        handleBox.visibility = View.GONE
        handle.tag = handleBox
        return panel
    }

    // ---------- панель затухает, когда ею не пользуются ----------
    private val dim = Runnable { if (extras.visibility != View.VISIBLE) panel.animate().alpha(0.35f).setDuration(400).start() }

    private fun wakePanel() {
        ui.removeCallbacks(dim)
        panel.animate().cancel(); panel.alpha = 1f
        ui.postDelayed(dim, 3500)
    }

    override fun dispatchTouchEvent(ev: android.view.MotionEvent): Boolean {
        if (ev.actionMasked == android.view.MotionEvent.ACTION_DOWN) {
            val loc = IntArray(2); panel.getLocationOnScreen(loc)
            // касание рядом с панелью (с запасом 48dp сверху) — показать её полностью
            if (ev.rawY >= loc[1] - dp(48)) wakePanel()
        }
        return super.dispatchTouchEvent(ev)
    }

    private fun toggleExtras() {
        val show = extras.visibility != View.VISIBLE
        extras.visibility = if (show) View.VISIBLE else View.GONE
        moreBtn.active = show
        wakePanel()
    }

    private fun collapse(c: Boolean) {
        mainBar.visibility = if (c) View.GONE else View.VISIBLE
        if (c) { extras.visibility = View.GONE; moreBtn.active = false }
        handle.visibility = if (c) View.VISIBLE else View.GONE
        (handle.tag as View).visibility = if (c) View.VISIBLE else View.GONE
    }

    // ---------- ориентация ----------

    private fun applyAutoOrientation() {
        val c = client ?: return
        if (forcedOrientation != null) return
        val portrait = c.fbHeight > c.fbWidth
        requestedOrientation = if (portrait) ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT
        else ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
    }

    private fun rotate() {
        val now = forcedOrientation ?: requestedOrientation
        val next = if (now == ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT || now == ActivityInfo.SCREEN_ORIENTATION_PORTRAIT)
            ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE else ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT
        forcedOrientation = next
        requestedOrientation = next
        rotateBtn.active = true
        Toast.makeText(this, "Поворот зафиксирован. Долгое нажатие — авто", Toast.LENGTH_SHORT).show()
        rotateBtn.setOnLongClickListener {
            forcedOrientation = null; rotateBtn.active = false; applyAutoOrientation(); true
        }
    }

    // ---------- скриншот ----------

    private fun screenshot() {
        val c = client ?: return
        val copy: Bitmap = synchronized(c.lock) { c.bitmap?.copy(Bitmap.Config.ARGB_8888, false) } ?: return
        Thread {
            val name = "DroidVM_" + SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(Date()) + ".png"
            val ok = runCatching {
                if (Build.VERSION.SDK_INT >= 29) {
                    val v = ContentValues().apply {
                        put(MediaStore.Images.Media.DISPLAY_NAME, name)
                        put(MediaStore.Images.Media.MIME_TYPE, "image/png")
                        put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/DroidVM")
                    }
                    val uri = contentResolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, v)!!
                    contentResolver.openOutputStream(uri)!!.use { copy.compress(Bitmap.CompressFormat.PNG, 100, it) }
                    "Галерея → Pictures/DroidVM"
                } else {
                    val dir = getExternalFilesDir(Environment.DIRECTORY_PICTURES)!!.apply { mkdirs() }
                    File(dir, name).outputStream().use { copy.compress(Bitmap.CompressFormat.PNG, 100, it) }
                    dir.absolutePath
                }
            }
            runOnUiThread {
                Toast.makeText(this, ok.fold({ "Скриншот сохранён: $it" }, { "Не удалось сохранить: ${it.message}" }), Toast.LENGTH_SHORT).show()
            }
        }.start()
    }

    // ---------- сохранение состояния ----------

    private fun saveState() {
        val cfg = VmRunner.current ?: return
        VmRunner.canSave(cfg)?.let { Ui.alert(this, "Нельзя сохранить", it); return }
        AlertDialog.Builder(this).setTitle("Сохранить и выйти?")
            .setMessage("Состояние ВМ (память ${cfg.ramMb} МБ) запишется на диск. В следующий раз нажмите «Продолжить» — " +
                "система откроется за секунды, без долгой загрузки.")
            .setPositiveButton("Сохранить") { _, _ ->
                val (dlg, upd) = Ui.progress(this, "Сохранение состояния")
                Thread {
                    val err = VmRunner.saveStateAndQuit(this) { upd(-1, it) }
                    runOnUiThread {
                        dlg.dismiss()
                        if (err != null) Ui.alert(this, "Не удалось сохранить", err) else finish()
                    }
                }.start()
            }.setNegativeButton("Отмена", null).show()
    }

    // ---------- меню ----------

    private fun showMenu() {
        val items = arrayOf(
            if (vnc.stretch) "Вписать с сохранением пропорций" else "Растянуть на весь экран",
            "Ctrl+Alt+Del", "Перезагрузить ВМ", "Выключить (как кнопкой питания)", "Остановить принудительно",
            "Журнал QEMU", "Свернуть (ВМ продолжит работу)",
            if (VmRunner.paused) "Продолжить работу ВМ" else "Пауза (процессор ВМ замрёт)",
            "Ввести текст из буфера обмена",
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
                7 -> Thread { VmRunner.setPaused(this, !VmRunner.paused) }.start()
                8 -> pasteText()
            }
        }.show()
    }

    /** Набрать в госте текст из буфера обмена телефона (латиница, цифры, знаки, Enter). */
    private fun pasteText() {
        val cm = getSystemService(android.content.ClipboardManager::class.java)
        val text = cm.primaryClip?.takeIf { it.itemCount > 0 }?.getItemAt(0)?.coerceToText(this)?.toString().orEmpty()
        if (text.isEmpty()) { Toast.makeText(this, "Буфер обмена пуст", Toast.LENGTH_SHORT).show(); return }
        val c = client ?: return
        val skipped = text.count { KeyMap.forChar(it) == null }
        text.forEach { ch -> if (KeyMap.forChar(ch) != null) c.typeChar(ch) }
        Toast.makeText(this, "Набрано ${text.length - skipped} симв." +
            if (skipped > 0) " Пропущено $skipped (кириллица и спецсимволы набираются клавиатурой внутри ВМ)." else "", Toast.LENGTH_LONG).show()
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

    // ---------- индикатор загрузки ----------

    /** Пока на экране гостя чёрный фон или текст консоли — показываем, что Android ещё грузится. */
    private val bootWatcher = object : Runnable {
        override fun run() {
            val c = client
            val bmp = c?.bitmap
            if (c != null && bmp != null && VmRunner.isActive) {
                var colorful = 0; var bright = 0; var n = 0
                synchronized(c.lock) {
                    val w = bmp.width; val h = bmp.height
                    for (yi in 1..24) for (xi in 1..24) {
                        val px = bmp.getPixel(w * xi / 25, h * yi / 25)
                        val r = (px shr 16) and 255; val g = (px shr 8) and 255; val b = px and 255
                        val mx = maxOf(r, g, b); val mn = minOf(r, g, b)
                        if (mx - mn > 40) colorful++
                        if (mx > 60) bright++
                        n++
                    }
                }
                val booting = colorful < n / 100 && bright < n * 15 / 100
                if (booting) {
                    val s = (System.currentTimeMillis() - VmRunner.startedAt) / 1000
                    bootPill.text = String.format(Locale.US, "Android загружается · %d:%02d", s / 60, s % 60)
                    bootPill.visibility = View.VISIBLE
                } else bootPill.visibility = View.GONE
            } else bootPill.visibility = View.GONE
            ui.postDelayed(this, 1000)
        }
    }

    override fun onResume() {
        super.onResume()
        VmRunner.addListener(this)
        connect()
        ui.post(bootWatcher)
        wakePanel()
    }

    override fun onPause() {
        ui.removeCallbacks(bootWatcher)
        ui.removeCallbacks(dim)
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
        runOnUiThread { applyAutoOrientation() }
        vnc.postInvalidate()
    }
    override fun onFrame() = vnc.postInvalidate()
    override fun onResize(width: Int, height: Int) {
        runOnUiThread { applyAutoOrientation() }
        vnc.postInvalidate()
    }
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
