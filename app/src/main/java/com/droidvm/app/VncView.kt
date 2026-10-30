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

    /** Режим тачпада: экран как тачпад ноутбука (для настольных систем, например NOVA OS). */
    var touchpad = false

    // состояние тачпада
    private var curX = -1f
    private var curY = -1f
    private var downAt = 0L
    private var downX = 0f
    private var downY = 0f
    private var lastTx = 0f
    private var lastTy = 0f
    private var moved = false
    private var multi = false
    private var multiScrolled = false
    private var dragging = false
    private var lastTapUp = 0L
    private var longFired = false
    private val longPress = Runnable {
        val c = client ?: return@Runnable
        if (!moved && !multi) {
            longFired = true
            performHapticFeedback(android.view.HapticFeedbackConstants.LONG_PRESS)
            c.pointer(4, curX.toInt(), curY.toInt()); c.pointer(0, curX.toInt(), curY.toInt())
        }
    }

    private fun handleTouchpad(e: MotionEvent, c: RfbClient): Boolean {
        val fbw = c.fbWidth.coerceAtLeast(1); val fbh = c.fbHeight.coerceAtLeast(1)
        if (curX < 0) { curX = fbw / 2f; curY = fbh / 2f }
        // скорость курсора: проход по ширине экрана ≈ 1.3 ширины гостя
        val speed = fbw / width.coerceAtLeast(1).toFloat() * 1.3f
        val slop = 10 * resources.displayMetrics.density
        when (e.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                requestFocus()
                downAt = System.currentTimeMillis(); downX = e.x; downY = e.y; lastTx = e.x; lastTy = e.y
                moved = false; multi = false; multiScrolled = false; longFired = false
                // двойной тап с удержанием — перетаскивание (левая кнопка зажата)
                dragging = downAt - lastTapUp < 300
                if (dragging) c.pointer(1, curX.toInt(), curY.toInt()) else postDelayed(longPress, 550)
            }
            MotionEvent.ACTION_POINTER_DOWN -> {
                multi = true; removeCallbacks(longPress)
                scrollAccum = 0f; lastScrollY = (e.getY(0) + e.getY(1)) / 2
            }
            MotionEvent.ACTION_MOVE -> {
                if (multi && e.pointerCount >= 2) {
                    val my = (e.getY(0) + e.getY(1)) / 2
                    scrollAccum += my - lastScrollY; lastScrollY = my
                    val step = 30 * resources.displayMetrics.density
                    while (abs(scrollAccum) >= step) {
                        multiScrolled = true
                        val mask = if (scrollAccum > 0) 8 else 16
                        c.pointer(mask, curX.toInt(), curY.toInt()); c.pointer(0, curX.toInt(), curY.toInt())
                        scrollAccum -= if (scrollAccum > 0) step else -step
                    }
                } else if (!multi) {
                    if (abs(e.x - downX) > slop || abs(e.y - downY) > slop) { moved = true; removeCallbacks(longPress) }
                    curX = (curX + (e.x - lastTx) * speed).coerceIn(0f, fbw - 1f)
                    curY = (curY + (e.y - lastTy) * speed).coerceIn(0f, fbh - 1f)
                    lastTx = e.x; lastTy = e.y
                    c.pointer(if (dragging) 1 else 0, curX.toInt(), curY.toInt())
                }
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                removeCallbacks(longPress)
                val quick = System.currentTimeMillis() - downAt < 250
                when {
                    dragging -> { c.pointer(0, curX.toInt(), curY.toInt()); dragging = false; lastTapUp = 0 }
                    multi -> if (!multiScrolled && quick) { // тап двумя пальцами — правый клик
                        performHapticFeedback(android.view.HapticFeedbackConstants.KEYBOARD_TAP)
                        c.pointer(4, curX.toInt(), curY.toInt()); c.pointer(0, curX.toInt(), curY.toInt())
                    }
                    !moved && !longFired && quick -> { // тап — левый клик
                        c.pointer(1, curX.toInt(), curY.toInt()); c.pointer(0, curX.toInt(), curY.toInt())
                        lastTapUp = System.currentTimeMillis()
                    }
                }
            }
        }
        return true
    }

    override fun onTouchEvent(e: MotionEvent): Boolean {
        val c = client ?: return true
        if (e.isFromSource(InputDevice.SOURCE_MOUSE)) return handleMouse(e, c)
        if (touchpad) return handleTouchpad(e, c)
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
