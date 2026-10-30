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
class IconButton(context: Context, val icon: Icons.Icon, label: String, private val onClick: () -> Unit) : View(context) {


    private val d = resources.displayMetrics.density
    private val p = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE; strokeWidth = 2f * d; strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND; color = 0xFFEDEFF2.toInt()
    }
    private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = 0xFFEDEFF2.toInt() }
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
        Icons.draw(c, icon, width / 2f, height / 2f, 11f * d, p, fill, d)
    }
}
