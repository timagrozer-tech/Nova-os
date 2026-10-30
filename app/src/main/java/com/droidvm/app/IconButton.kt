package com.droidvm.app

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.RippleDrawable
import android.content.res.ColorStateList
import android.view.HapticFeedbackConstants
import android.view.View

/** Круглая кнопка с иконкой, нарисованной линиями (не зависит от шрифтов и эмодзи). */
class IconButton(context: Context, val icon: Icon, label: String, private val onClick: () -> Unit) : View(context) {

    enum class Icon { KEYBOARD, BACK, HOME, RECENTS, POWER, VOL_DOWN, VOL_UP, ROTATE, CAMERA, MORE, HIDE, SHOW, SAVE }

    private val d = resources.displayMetrics.density
    private val p = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE; strokeWidth = 2f * d; strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND; color = 0xFFEDEFF2.toInt()
    }
    private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFFEDEFF2.toInt() }
    private val path = Path()
    private val r = RectF()
    var active = false
        set(v) { field = v; p.color = if (v) Ui.ACCENT else 0xFFEDEFF2.toInt(); fill.color = p.color; invalidate() }

    init {
        contentDescription = label
        tooltipText = label
        isClickable = true
        isFocusable = false
        background = RippleDrawable(ColorStateList.valueOf(0x33FFFFFF), null,
            GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(0xFFFFFFFF.toInt()) })
        setOnClickListener {
            performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP)
            onClick()
        }
    }

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val s = (48 * d).toInt()
        setMeasuredDimension(s, s)
    }

    override fun onDraw(c: Canvas) {
        val cx = width / 2f; val cy = height / 2f
        val u = 11f * d // половина размера иконки
        path.reset()
        when (icon) {
            Icon.BACK -> {
                path.moveTo(cx + u * 0.7f, cy - u * 0.8f); path.lineTo(cx - u * 0.75f, cy); path.lineTo(cx + u * 0.7f, cy + u * 0.8f); path.close()
                c.drawPath(path, p)
            }
            Icon.HOME -> c.drawCircle(cx, cy, u * 0.8f, p)
            Icon.RECENTS -> { r.set(cx - u * 0.75f, cy - u * 0.75f, cx + u * 0.75f, cy + u * 0.75f); c.drawRoundRect(r, 3 * d, 3 * d, p) }
            Icon.KEYBOARD -> {
                r.set(cx - u, cy - u * 0.65f, cx + u, cy + u * 0.65f); c.drawRoundRect(r, 3 * d, 3 * d, p)
                for (row in 0..1) for (i in 0..3) c.drawCircle(cx - u * 0.6f + i * u * 0.4f, cy - u * 0.25f + row * u * 0.35f, 1.1f * d, fill)
                c.drawLine(cx - u * 0.4f, cy + u * 0.4f, cx + u * 0.4f, cy + u * 0.4f, p)
            }
            Icon.POWER -> {
                r.set(cx - u * 0.8f, cy - u * 0.7f, cx + u * 0.8f, cy + u * 0.9f)
                c.drawArc(r, -60f, 300f, false, p)
                c.drawLine(cx, cy - u, cx, cy, p)
            }
            Icon.VOL_DOWN, Icon.VOL_UP -> {
                path.moveTo(cx - u, cy - u * 0.3f); path.lineTo(cx - u * 0.55f, cy - u * 0.3f); path.lineTo(cx - u * 0.05f, cy - u * 0.8f)
                path.lineTo(cx - u * 0.05f, cy + u * 0.8f); path.lineTo(cx - u * 0.55f, cy + u * 0.3f); path.lineTo(cx - u, cy + u * 0.3f); path.close()
                c.drawPath(path, p)
                r.set(cx - u * 0.4f, cy - u * 0.45f, cx + u * 0.5f, cy + u * 0.45f); c.drawArc(r, -50f, 100f, false, p)
                if (icon == Icon.VOL_UP) { r.set(cx - u * 0.4f, cy - u * 0.85f, cx + u * 0.95f, cy + u * 0.85f); c.drawArc(r, -50f, 100f, false, p) }
            }
            Icon.ROTATE -> {
                r.set(cx - u * 0.8f, cy - u * 0.8f, cx + u * 0.8f, cy + u * 0.8f)
                c.drawArc(r, -80f, 290f, false, p)
                val ax = cx + u * 0.14f; val ay = cy - u * 0.79f
                c.drawLine(ax, ay, ax - u * 0.4f, ay - u * 0.35f, p); c.drawLine(ax, ay, ax - u * 0.4f, ay + u * 0.35f, p)
            }
            Icon.CAMERA -> {
                r.set(cx - u, cy - u * 0.55f, cx + u, cy + u * 0.75f); c.drawRoundRect(r, 3 * d, 3 * d, p)
                c.drawLine(cx - u * 0.35f, cy - u * 0.55f, cx - u * 0.2f, cy - u * 0.85f, p)
                c.drawLine(cx - u * 0.2f, cy - u * 0.85f, cx + u * 0.2f, cy - u * 0.85f, p)
                c.drawLine(cx + u * 0.2f, cy - u * 0.85f, cx + u * 0.35f, cy - u * 0.55f, p)
                c.drawCircle(cx, cy + u * 0.1f, u * 0.35f, p)
            }
            Icon.MORE -> for (i in -1..1) c.drawCircle(cx, cy + i * u * 0.6f, 1.8f * d, fill)
            Icon.HIDE -> { c.drawLine(cx - u * 0.7f, cy - u * 0.3f, cx, cy + u * 0.4f, p); c.drawLine(cx, cy + u * 0.4f, cx + u * 0.7f, cy - u * 0.3f, p) }
            Icon.SHOW -> { c.drawLine(cx - u * 0.7f, cy + u * 0.3f, cx, cy - u * 0.4f, p); c.drawLine(cx, cy - u * 0.4f, cx + u * 0.7f, cy + u * 0.3f, p) }
            Icon.SAVE -> {
                r.set(cx - u * 0.8f, cy - u * 0.8f, cx + u * 0.8f, cy + u * 0.8f); c.drawRoundRect(r, 3 * d, 3 * d, p)
                c.drawLine(cx, cy - u * 0.45f, cx, cy + u * 0.3f, p)
                c.drawLine(cx - u * 0.35f, cy, cx, cy + u * 0.3f, p); c.drawLine(cx + u * 0.35f, cy, cx, cy + u * 0.3f, p)
            }
        }
    }
}
