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
    const val ACCENT = 0xFF4CAF50.toInt()
    const val BG = 0xFF121417.toInt()
    const val CARD = 0xFF1E2227.toInt()
    const val MUTED = 0xFF9AA4AE.toInt()

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
        this.text = text; textSize = size; setTypeface(typeface, Typeface.BOLD); setTextColor(Color.WHITE)
    }

    fun label(ctx: Context, text: String, size: Float = 14f, color: Int = MUTED) = TextView(ctx).apply {
        this.text = text; textSize = size; setTextColor(color)
    }

    fun button(ctx: Context, text: String, primary: Boolean = false, onClick: (View) -> Unit) = Button(ctx).apply {
        this.text = text
        isAllCaps = false
        setTextColor(if (primary) Color.BLACK else Color.WHITE)
        background = GradientDrawable().apply {
            cornerRadius = ctx.dp(10).toFloat()
            setColor(if (primary) ACCENT else 0xFF2C323A.toInt())
        }
        setOnClickListener(onClick)
    }

    fun card(ctx: Context) = vbox(ctx, 14).apply {
        background = GradientDrawable().apply { cornerRadius = ctx.dp(14).toFloat(); setColor(CARD) }
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
