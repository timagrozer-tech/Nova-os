package com.droidvm.app

import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView

/** Небольшие помощники для интерфейса, собранного кодом (без XML-разметки). */
object Ui {
    // Палитра DroidVM: тёмная тема, «андроидный» зелёный акцент
    const val ACCENT = 0xFF3DDC84.toInt()       // основной акцент
    const val ON_ACCENT = 0xFF06210F.toInt()    // текст на акценте
    const val ACCENT_SOFT = 0xFF173524.toInt()  // мягкая подложка акцента
    const val BG = 0xFF0E1013.toInt()           // фон экрана
    const val CARD = 0xFF171A1F.toInt()         // карточка
    const val CARD2 = 0xFF20252C.toInt()        // вложенный элемент / вторичная кнопка
    const val OUTLINE = 0xFF2A3038.toInt()
    const val TEXT = 0xFFE8EAED.toInt()
    const val MUTED = 0xFF9AA0A6.toInt()
    const val WARN = 0xFFF2B33D.toInt()
    const val WARN_SOFT = 0xFF3A2E12.toInt()
    const val INFO = 0xFF7AB7FF.toInt()
    const val INFO_SOFT = 0xFF14263D.toInt()

    fun Context.dp(v: Int) = (v * resources.displayMetrics.density).toInt()

    fun vbox(ctx: Context, padDp: Int = 16) = LinearLayout(ctx).apply {
        orientation = LinearLayout.VERTICAL
        val p = ctx.dp(padDp); setPadding(p, p, p, p)
    }

    fun hbox(ctx: Context) = LinearLayout(ctx).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
    }

    fun title(ctx: Context, text: String, size: Float = 22f) = TextView(ctx).apply {
        this.text = text; textSize = size; setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL)); setTextColor(TEXT)
    }

    fun label(ctx: Context, text: String, size: Float = 14f, color: Int = MUTED) = TextView(ctx).apply {
        this.text = text; textSize = size; setTextColor(color)
    }

    fun button(ctx: Context, text: String, primary: Boolean = false, onClick: (View) -> Unit) = Button(ctx).apply {
        this.text = text
        isAllCaps = false
        setTextColor(if (primary) ON_ACCENT else TEXT)
        typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
        textSize = 14f
        stateListAnimator = null
        minHeight = ctx.dp(44); minimumHeight = ctx.dp(44)
        background = android.graphics.drawable.RippleDrawable(
            android.content.res.ColorStateList.valueOf(if (primary) 0x33000000 else 0x22FFFFFF),
            GradientDrawable().apply { cornerRadius = ctx.dp(22).toFloat(); setColor(if (primary) ACCENT else CARD2) }, null)
        setOnClickListener(onClick)
    }

    fun card(ctx: Context) = vbox(ctx, 16).apply {
        background = GradientDrawable().apply { cornerRadius = ctx.dp(20).toFloat(); setColor(CARD) }
    }

    /** Цветная плашка-статус. */
    fun chip(ctx: Context, text: String, fg: Int = ACCENT, bg: Int = ACCENT_SOFT) = TextView(ctx).apply {
        this.text = text; textSize = 12f; setTextColor(fg)
        typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
        setPadding(ctx.dp(10), ctx.dp(4), ctx.dp(10), ctx.dp(4))
        background = GradientDrawable().apply { cornerRadius = ctx.dp(12).toFloat(); setColor(bg) }
    }

    /** Квадратная плитка с иконкой. */
    fun iconTile(ctx: Context, icon: Icons.Icon, fg: Int = ACCENT, bg: Int = ACCENT_SOFT, sizeDp: Int = 44) =
        android.widget.FrameLayout(ctx).apply {
            background = GradientDrawable().apply { cornerRadius = ctx.dp(14).toFloat(); setColor(bg) }
            addView(IconView(ctx, icon, 22, fg), android.widget.FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER))
            layoutParams = LinearLayout.LayoutParams(ctx.dp(sizeDp), ctx.dp(sizeDp))
        }

    /** Круглая кнопка-иконка (вторичное действие). */
    fun iconAction(ctx: Context, icon: Icons.Icon, label: String, onClick: () -> Unit) =
        android.widget.FrameLayout(ctx).apply {
            contentDescription = label; tooltipText = label
            background = android.graphics.drawable.RippleDrawable(android.content.res.ColorStateList.valueOf(0x22FFFFFF),
                GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(CARD2) }, null)
            addView(IconView(ctx, icon, 20, TEXT), android.widget.FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER))
            setOnClickListener { performHapticFeedback(android.view.HapticFeedbackConstants.KEYBOARD_TAP); onClick() }
            layoutParams = LinearLayout.LayoutParams(ctx.dp(44), ctx.dp(44)).apply { leftMargin = ctx.dp(8) }
        }

    fun sectionTitle(ctx: Context, text: String) = TextView(ctx).apply {
        this.text = text; textSize = 13f; setTextColor(MUTED); letterSpacing = 0.04f
        typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
    }

    fun lp(w: Int = ViewGroup.LayoutParams.MATCH_PARENT, h: Int = ViewGroup.LayoutParams.WRAP_CONTENT, top: Int = 0, ctx: Context? = null) =
        LinearLayout.LayoutParams(w, h).apply { if (ctx != null) topMargin = ctx.dp(top) }

    fun weight(w: Float = 1f) = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, w)

    fun alert(a: Activity, title: String, msg: String) {
        if (a.isFinishing) return
        AlertDialog.Builder(a).setTitle(title).setMessage(msg).setPositiveButton("OK", null).show()
    }

    /** Диалог с прогрессом; возвращает функцию обновления (0..100, -1 = неопределённо) и сам диалог. */
    fun progress(a: Activity, title: String, onCancel: (() -> Unit)? = null): Pair<AlertDialog, (Int, String) -> Unit> {
        val box = vbox(a, 20)
        val bar = ProgressBar(a, null, android.R.attr.progressBarStyleHorizontal).apply { max = 100; isIndeterminate = true }
        val text = label(a, "")
        box.addView(bar); box.addView(text)
        val b = AlertDialog.Builder(a).setTitle(title).setView(box).setCancelable(false)
        if (onCancel != null) b.setNegativeButton("Отмена") { _, _ -> onCancel() }
        val d = b.create()
        d.show()
        return d to { p: Int, s: String ->
            a.runOnUiThread {
                bar.isIndeterminate = p < 0
                if (p >= 0) bar.progress = p
                text.text = s
            }
        }
    }
}
