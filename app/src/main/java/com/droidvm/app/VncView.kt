package com.droidvm.app

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.text.InputType
import android.view.InputDevice
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.view.inputmethod.BaseInputConnection
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputConnection
import kotlin.math.abs

/** Отображает экран ВМ и превращает касания/клавиатуру в события VNC. */
class VncView(context: Context) : View(context) {

    var client: RfbClient? = null
    /** true — растянуть на весь экран, false — вписать с сохранением пропорций. */
    var stretch = false
        set(v) { field = v; invalidate() }

    private val paint = Paint(Paint.FILTER_BITMAP_FLAG)
    private val matrix = Matrix()
    private val inverse = Matrix()
    private val pt = FloatArray(2)

    init {
        isFocusable = true
        isFocusableInTouchMode = true
        setBackgroundColor(Color.BLACK)
    }

    override fun onDraw(canvas: Canvas) {
        val c = client ?: return
        synchronized(c.lock) {
            val bmp = c.bitmap ?: return
            computeMatrix(bmp.width, bmp.height)
            canvas.drawBitmap(bmp, matrix, paint)
        }
    }

    private fun computeMatrix(bw: Int, bh: Int) {
        matrix.reset()
        if (bw <= 0 || bh <= 0 || width == 0 || height == 0) return
        if (stretch) {
            matrix.setScale(width.toFloat() / bw, height.toFloat() / bh)
        } else {
            val s = minOf(width.toFloat() / bw, height.toFloat() / bh)
            matrix.setScale(s, s)
            matrix.postTranslate((width - bw * s) / 2f, (height - bh * s) / 2f)
        }
        matrix.invert(inverse)
    }

    private fun toFb(x: Float, y: Float): Pair<Int, Int> {
        pt[0] = x; pt[1] = y
        inverse.mapPoints(pt)
        return pt[0].toInt() to pt[1].toInt()
    }

    // ---------- касания ----------
    private var scrolling = false
    private var scrollAccum = 0f
    private var lastScrollY = 0f
    private var lastX = 0
    private var lastY = 0

    override fun onTouchEvent(e: MotionEvent): Boolean {
        val c = client ?: return true
        if (e.isFromSource(InputDevice.SOURCE_MOUSE)) return handleMouse(e, c)
        when (e.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                requestFocus()
                scrolling = false
                val (x, y) = toFb(e.x, e.y); lastX = x; lastY = y
                c.pointer(0, x, y)
                c.pointer(1, x, y)
            }
            MotionEvent.ACTION_POINTER_DOWN -> if (e.pointerCount == 2) {
                // второй палец — режим прокрутки колёсиком
                c.pointer(0, lastX, lastY)
                scrolling = true
                scrollAccum = 0f
                lastScrollY = (e.getY(0) + e.getY(1)) / 2
            }
            MotionEvent.ACTION_MOVE -> {
                if (scrolling && e.pointerCount >= 2) {
                    val my = (e.getY(0) + e.getY(1)) / 2
                    scrollAccum += my - lastScrollY
                    lastScrollY = my
                    val step = 40f * resources.displayMetrics.density
                    while (abs(scrollAccum) >= step) {
                        val mask = if (scrollAccum > 0) 8 else 16 // палец вниз → колесо вверх
                        c.pointer(mask, lastX, lastY); c.pointer(0, lastX, lastY)
                        scrollAccum -= if (scrollAccum > 0) step else -step
                    }
                } else if (!scrolling) {
                    val (x, y) = toFb(e.x, e.y); lastX = x; lastY = y
                    c.pointer(1, x, y)
                }
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                if (!scrolling) {
                    val (x, y) = toFb(e.x, e.y)
                    c.pointer(0, x, y)
                }
                scrolling = false
            }
        }
        return true
    }

    private fun mouseMask(e: MotionEvent): Int {
        var m = 0
        if (e.buttonState and MotionEvent.BUTTON_PRIMARY != 0) m = m or 1
        if (e.buttonState and MotionEvent.BUTTON_TERTIARY != 0) m = m or 2
        if (e.buttonState and MotionEvent.BUTTON_SECONDARY != 0) m = m or 4
        return m
    }

    private fun handleMouse(e: MotionEvent, c: RfbClient): Boolean {
        val (x, y) = toFb(e.x, e.y); lastX = x; lastY = y
        c.pointer(mouseMask(e), x, y)
        return true
    }

    override fun onGenericMotionEvent(e: MotionEvent): Boolean {
        val c = client ?: return false
        if (!e.isFromSource(InputDevice.SOURCE_CLASS_POINTER)) return super.onGenericMotionEvent(e)
        val (x, y) = toFb(e.x, e.y); lastX = x; lastY = y
        when (e.actionMasked) {
            MotionEvent.ACTION_HOVER_MOVE -> c.pointer(mouseMask(e), x, y)
            MotionEvent.ACTION_SCROLL -> {
                val v = e.getAxisValue(MotionEvent.AXIS_VSCROLL)
                if (v != 0f) { val m = if (v > 0) 8 else 16; c.pointer(m, x, y); c.pointer(0, x, y) }
            }
            else -> return super.onGenericMotionEvent(e)
        }
        return true
    }

    // ---------- клавиатура ----------

    override fun onCheckIsTextEditor() = true

    override fun onCreateInputConnection(outAttrs: EditorInfo): InputConnection {
        outAttrs.inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD or
            InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS
        outAttrs.imeOptions = EditorInfo.IME_FLAG_NO_EXTRACT_UI or EditorInfo.IME_FLAG_NO_FULLSCREEN or
            EditorInfo.IME_ACTION_NONE
        return object : BaseInputConnection(this, false) {
            override fun commitText(text: CharSequence, newCursorPosition: Int): Boolean {
                text.forEach { client?.typeChar(it) }
                return true
            }
            override fun setComposingText(text: CharSequence, newCursorPosition: Int): Boolean = true
            override fun finishComposingText(): Boolean = true
            override fun deleteSurroundingText(beforeLength: Int, afterLength: Int): Boolean {
                repeat(beforeLength.coerceAtLeast(1)) { client?.tap(KeyMap.BACKSPACE) }
                return true
            }
            override fun sendKeyEvent(event: KeyEvent): Boolean {
                handleKey(event)
                return true
            }
            override fun performEditorAction(actionCode: Int): Boolean {
                client?.tap(KeyMap.ENTER); return true
            }
        }
    }

    private fun isSystemKey(code: Int) = code == KeyEvent.KEYCODE_VOLUME_UP || code == KeyEvent.KEYCODE_VOLUME_DOWN ||
        code == KeyEvent.KEYCODE_BACK || code == KeyEvent.KEYCODE_HOME || code == KeyEvent.KEYCODE_POWER

    private fun handleKey(event: KeyEvent): Boolean {
        val c = client ?: return false
        if (isSystemKey(event.keyCode)) return false
        val down = event.action == KeyEvent.ACTION_DOWN
        if (event.action == KeyEvent.ACTION_MULTIPLE && event.keyCode == KeyEvent.KEYCODE_UNKNOWN) {
            event.characters?.forEach { c.typeChar(it) }
            return true
        }
        val k = KeyMap.forKeyCode(event.keyCode)
        if (k != null) { c.key(down, k.keysym, k.scancode); return true }
        // символ без отдельной клавиши (напр. с аппаратной клавиатуры с другой раскладкой)
        val uc = event.unicodeChar
        if (down && uc > 0) { c.typeChar(uc.toChar()); return true }
        return false
    }

    override fun onKeyDown(keyCode: Int, event: KeyEvent) = handleKey(event) || super.onKeyDown(keyCode, event)
    override fun onKeyUp(keyCode: Int, event: KeyEvent) = handleKey(event) || super.onKeyUp(keyCode, event)
    override fun onKeyMultiple(keyCode: Int, repeatCount: Int, event: KeyEvent) =
        handleKey(event) || super.onKeyMultiple(keyCode, repeatCount, event)
}
