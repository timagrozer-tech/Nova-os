package com.droidvm.app

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.view.View

/** Иконки приложения, нарисованные линиями (не зависят от шрифтов и эмодзи). */
object Icons {
    enum class Icon {
        KEYBOARD, BACK, HOME, RECENTS, POWER, VOL_DOWN, VOL_UP, ROTATE, CAMERA, MORE, HIDE, SHOW, SAVE,
        PLAY, STOP, EDIT, TRASH, FOLDER, PLUS, LOG, ROBOT, CHIP, DOWNLOAD, SCREEN, PAUSE
    }

    private val path = Path()
    private val r = RectF()

    /** cx, cy — центр, u — половина размера иконки, d — плотность экрана. */
    fun draw(c: Canvas, icon: Icon, cx: Float, cy: Float, u: Float, p: Paint, fill: Paint, d: Float) {
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
            Icon.PLAY -> {
                path.moveTo(cx - u * 0.5f, cy - u * 0.8f); path.lineTo(cx + u * 0.8f, cy); path.lineTo(cx - u * 0.5f, cy + u * 0.8f); path.close()
                c.drawPath(path, fill)
            }
            Icon.STOP -> { r.set(cx - u * 0.65f, cy - u * 0.65f, cx + u * 0.65f, cy + u * 0.65f); c.drawRoundRect(r, 2 * d, 2 * d, fill) }
            Icon.PAUSE -> { r.set(cx - u * 0.6f, cy - u * 0.7f, cx - u * 0.15f, cy + u * 0.7f); c.drawRoundRect(r, d, d, fill)
                r.set(cx + u * 0.15f, cy - u * 0.7f, cx + u * 0.6f, cy + u * 0.7f); c.drawRoundRect(r, d, d, fill) }
            Icon.EDIT -> {
                path.moveTo(cx - u * 0.8f, cy + u * 0.8f); path.lineTo(cx - u * 0.75f, cy + u * 0.35f); path.lineTo(cx + u * 0.45f, cy - u * 0.85f)
                path.lineTo(cx + u * 0.85f, cy - u * 0.45f); path.lineTo(cx - u * 0.35f, cy + u * 0.75f); path.close()
                c.drawPath(path, p)
            }
            Icon.TRASH -> {
                c.drawLine(cx - u * 0.85f, cy - u * 0.55f, cx + u * 0.85f, cy - u * 0.55f, p)
                c.drawLine(cx - u * 0.3f, cy - u * 0.85f, cx + u * 0.3f, cy - u * 0.85f, p)
                r.set(cx - u * 0.6f, cy - u * 0.55f, cx + u * 0.6f, cy + u * 0.9f); c.drawRoundRect(r, 2 * d, 2 * d, p)
            }
            Icon.FOLDER -> {
                path.moveTo(cx - u, cy - u * 0.6f); path.lineTo(cx - u * 0.3f, cy - u * 0.6f); path.lineTo(cx - u * 0.1f, cy - u * 0.35f)
                path.lineTo(cx + u, cy - u * 0.35f); path.lineTo(cx + u, cy + u * 0.7f); path.lineTo(cx - u, cy + u * 0.7f); path.close()
                c.drawPath(path, p)
            }
            Icon.PLUS -> { c.drawLine(cx - u * 0.75f, cy, cx + u * 0.75f, cy, p); c.drawLine(cx, cy - u * 0.75f, cx, cy + u * 0.75f, p) }
            Icon.LOG -> for (i in -1..1) c.drawLine(cx - u * 0.8f, cy + i * u * 0.5f, cx + u * (if (i == 1) 0.3f else 0.8f), cy + i * u * 0.5f, p)
            Icon.ROBOT -> {
                r.set(cx - u * 0.9f, cy - u * 0.5f, cx + u * 0.9f, cy + u * 1.1f); c.drawArc(r, 180f, 180f, true, fill)
                c.drawLine(cx - u * 0.5f, cy - u * 0.55f, cx - u * 0.75f, cy - u * 0.95f, p)
                c.drawLine(cx + u * 0.5f, cy - u * 0.55f, cx + u * 0.75f, cy - u * 0.95f, p)
            }
            Icon.CHIP -> {
                r.set(cx - u * 0.55f, cy - u * 0.55f, cx + u * 0.55f, cy + u * 0.55f); c.drawRoundRect(r, 2 * d, 2 * d, p)
                for (i in -1..1) {
                    val o = i * u * 0.35f
                    c.drawLine(cx + o, cy - u * 0.55f, cx + o, cy - u * 0.9f, p); c.drawLine(cx + o, cy + u * 0.55f, cx + o, cy + u * 0.9f, p)
                    c.drawLine(cx - u * 0.55f, cy + o, cx - u * 0.9f, cy + o, p); c.drawLine(cx + u * 0.55f, cy + o, cx + u * 0.9f, cy + o, p)
                }
            }
            Icon.DOWNLOAD -> {
                c.drawLine(cx, cy - u * 0.85f, cx, cy + u * 0.35f, p)
                c.drawLine(cx - u * 0.45f, cy - u * 0.1f, cx, cy + u * 0.35f, p); c.drawLine(cx + u * 0.45f, cy - u * 0.1f, cx, cy + u * 0.35f, p)
                c.drawLine(cx - u * 0.8f, cy + u * 0.85f, cx + u * 0.8f, cy + u * 0.85f, p)
            }
            Icon.SCREEN -> {
                r.set(cx - u * 0.55f, cy - u * 0.95f, cx + u * 0.55f, cy + u * 0.95f); c.drawRoundRect(r, 3 * d, 3 * d, p)
                c.drawLine(cx - u * 0.15f, cy + u * 0.7f, cx + u * 0.15f, cy + u * 0.7f, p)
            }
        }
    }
}

/** Иконка без фона заданного размера и цвета. */
class IconView(context: Context, var icon: Icons.Icon, private val sizeDp: Int, color: Int) : View(context) {
    private val d = resources.displayMetrics.density
    private val p = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE; strokeWidth = 2f * d; strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND; this.color = color
    }
    private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color = color }
    fun setColor(c: Int) { p.color = c; fill.color = c; invalidate() }
    override fun onMeasure(w: Int, h: Int) { val s = (sizeDp * d).toInt(); setMeasuredDimension(s, s) }
    override fun onDraw(c: Canvas) = Icons.draw(c, icon, width / 2f, height / 2f, width * 0.42f, p, fill, d)
}
