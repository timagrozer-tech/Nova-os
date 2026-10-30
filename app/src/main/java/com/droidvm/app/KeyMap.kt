package com.droidvm.app

import android.view.KeyEvent

/**
 * Таблицы клавиш: Android KeyEvent / символ → (X11 keysym, XT скан-код в формате QEMU).
 * Двухбайтные скан-коды E0 xx кодируются как 0x80 | xx.
 */
object KeyMap {

    data class Key(val keysym: Int, val scancode: Int)

    val SHIFT = Key(0xffe1, 0x2a)
    val CTRL = Key(0xffe3, 0x1d)
    val ALT = Key(0xffe9, 0x38)
    val TAB = Key(0xff09, 0x0f)
    val ESC = Key(0xff1b, 0x01)
    val ENTER = Key(0xff0d, 0x1c)
    val BACKSPACE = Key(0xff08, 0x0e)

    // Специальные клавиши Android (Generic.kl: HOMEPAGE→HOME, BACK, POWER, VOLUME)
    val HOME = Key(0x1008ff18, 0xb2)        // XF86HomePage, E0 32
    val BACK = Key(0x1008ff26, 0xea)        // XF86Back, E0 6A
    val POWER = Key(0x1008ff2a, 0xde)       // XF86PowerOff, E0 5E
    val VOL_UP = Key(0x1008ff13, 0xb0)      // E0 30
    val VOL_DOWN = Key(0x1008ff11, 0xae)    // E0 2E
    val MENU = Key(0xff67, 0xdd)            // Menu / Apps key, E0 5D

    private val letters = "qwertyuiop" to 0x10
    private val letters2 = "asdfghjkl" to 0x1e
    private val letters3 = "zxcvbnm" to 0x2c

    private fun letterScan(c: Char): Int? {
        for ((row, base) in listOf(letters, letters2, letters3)) {
            val i = row.indexOf(c)
            if (i >= 0) return base + i
        }
        return null
    }

    // символ → (скан-код, нужен ли Shift)
    private val symbols: Map<Char, Pair<Int, Boolean>> = mapOf(
        '1' to (0x02 to false), '2' to (0x03 to false), '3' to (0x04 to false), '4' to (0x05 to false),
        '5' to (0x06 to false), '6' to (0x07 to false), '7' to (0x08 to false), '8' to (0x09 to false),
        '9' to (0x0a to false), '0' to (0x0b to false),
        '!' to (0x02 to true), '@' to (0x03 to true), '#' to (0x04 to true), '$' to (0x05 to true),
        '%' to (0x06 to true), '^' to (0x07 to true), '&' to (0x08 to true), '*' to (0x09 to true),
        '(' to (0x0a to true), ')' to (0x0b to true),
        '-' to (0x0c to false), '_' to (0x0c to true), '=' to (0x0d to false), '+' to (0x0d to true),
        '[' to (0x1a to false), '{' to (0x1a to true), ']' to (0x1b to false), '}' to (0x1b to true),
        '\\' to (0x2b to false), '|' to (0x2b to true), ';' to (0x27 to false), ':' to (0x27 to true),
        '\'' to (0x28 to false), '"' to (0x28 to true), '`' to (0x29 to false), '~' to (0x29 to true),
        ',' to (0x33 to false), '<' to (0x33 to true), '.' to (0x34 to false), '>' to (0x34 to true),
        '/' to (0x35 to false), '?' to (0x35 to true), ' ' to (0x39 to false),
        '\n' to (0x1c to false), '\t' to (0x0f to false),
    )

    fun forChar(c: Char): Pair<Key, Boolean>? {
        if (c == '\n') return ENTER to false
        if (c == '\t') return TAB to false
        val lower = c.lowercaseChar()
        if (lower in 'a'..'z') {
            val sc = letterScan(lower) ?: return null
            return Key(c.code, sc) to c.isUpperCase()
        }
        val s = symbols[c] ?: return null
        return Key(c.code, s.first) to s.second
    }

    private val codes: Map<Int, Key> by lazy {
        val m = HashMap<Int, Key>()
        for (c in 'a'..'z') m[KeyEvent.KEYCODE_A + (c - 'a')] = Key(c.code, letterScan(c)!!)
        for (d in 0..9) m[KeyEvent.KEYCODE_0 + d] = Key('0'.code + d, if (d == 0) 0x0b else 0x01 + d)
        val fk = intArrayOf(0x3b, 0x3c, 0x3d, 0x3e, 0x3f, 0x40, 0x41, 0x42, 0x43, 0x44, 0x57, 0x58)
        for (i in 0 until 12) m[KeyEvent.KEYCODE_F1 + i] = Key(0xffbe + i, fk[i])
        m[KeyEvent.KEYCODE_ENTER] = ENTER
        m[KeyEvent.KEYCODE_NUMPAD_ENTER] = Key(0xff8d, 0x9c)
        m[KeyEvent.KEYCODE_DEL] = BACKSPACE
        m[KeyEvent.KEYCODE_FORWARD_DEL] = Key(0xffff, 0xd3)
        m[KeyEvent.KEYCODE_TAB] = TAB
        m[KeyEvent.KEYCODE_SPACE] = Key(0x20, 0x39)
        m[KeyEvent.KEYCODE_ESCAPE] = ESC
        m[KeyEvent.KEYCODE_DPAD_UP] = Key(0xff52, 0xc8)
        m[KeyEvent.KEYCODE_DPAD_DOWN] = Key(0xff54, 0xd0)
        m[KeyEvent.KEYCODE_DPAD_LEFT] = Key(0xff51, 0xcb)
        m[KeyEvent.KEYCODE_DPAD_RIGHT] = Key(0xff53, 0xcd)
        m[KeyEvent.KEYCODE_MOVE_HOME] = Key(0xff50, 0xc7)
        m[KeyEvent.KEYCODE_MOVE_END] = Key(0xff57, 0xcf)
        m[KeyEvent.KEYCODE_PAGE_UP] = Key(0xff55, 0xc9)
        m[KeyEvent.KEYCODE_PAGE_DOWN] = Key(0xff56, 0xd1)
        m[KeyEvent.KEYCODE_INSERT] = Key(0xff63, 0xd2)
        m[KeyEvent.KEYCODE_SHIFT_LEFT] = SHIFT
        m[KeyEvent.KEYCODE_SHIFT_RIGHT] = Key(0xffe2, 0x36)
        m[KeyEvent.KEYCODE_CTRL_LEFT] = CTRL
        m[KeyEvent.KEYCODE_CTRL_RIGHT] = Key(0xffe4, 0x9d)
        m[KeyEvent.KEYCODE_ALT_LEFT] = ALT
        m[KeyEvent.KEYCODE_ALT_RIGHT] = Key(0xffea, 0xb8)
        m[KeyEvent.KEYCODE_META_LEFT] = Key(0xffeb, 0xdb)
        m[KeyEvent.KEYCODE_META_RIGHT] = Key(0xffec, 0xdc)
        m[KeyEvent.KEYCODE_CAPS_LOCK] = Key(0xffe5, 0x3a)
        m[KeyEvent.KEYCODE_MINUS] = Key('-'.code, 0x0c)
        m[KeyEvent.KEYCODE_EQUALS] = Key('='.code, 0x0d)
        m[KeyEvent.KEYCODE_LEFT_BRACKET] = Key('['.code, 0x1a)
        m[KeyEvent.KEYCODE_RIGHT_BRACKET] = Key(']'.code, 0x1b)
        m[KeyEvent.KEYCODE_BACKSLASH] = Key('\\'.code, 0x2b)
        m[KeyEvent.KEYCODE_SEMICOLON] = Key(';'.code, 0x27)
        m[KeyEvent.KEYCODE_APOSTROPHE] = Key('\''.code, 0x28)
        m[KeyEvent.KEYCODE_GRAVE] = Key('`'.code, 0x29)
        m[KeyEvent.KEYCODE_COMMA] = Key(','.code, 0x33)
        m[KeyEvent.KEYCODE_PERIOD] = Key('.'.code, 0x34)
        m[KeyEvent.KEYCODE_SLASH] = Key('/'.code, 0x35)
        m[KeyEvent.KEYCODE_VOLUME_UP] = VOL_UP
        m[KeyEvent.KEYCODE_VOLUME_DOWN] = VOL_DOWN
        m[KeyEvent.KEYCODE_MENU] = MENU
        m
    }

    fun forKeyCode(code: Int): Key? = codes[code]
}
