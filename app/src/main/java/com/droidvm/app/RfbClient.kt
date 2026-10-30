package com.droidvm.app

import android.graphics.Bitmap
import android.net.LocalSocket
import android.net.LocalSocketAddress
import java.io.BufferedInputStream
import java.io.BufferedOutputStream
import java.io.DataInputStream
import java.io.DataOutputStream
import java.io.IOException
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.Executors

/**
 * Минимальный клиент RFB 3.8 (VNC) для встроенного VNC-сервера QEMU через unix-сокет.
 * Поддерживает кодировки Raw, CopyRect, DesktopSize и расширенные события клавиш QEMU
 * (передача аппаратных скан-кодов — так работают кнопки «Домой»/«Назад»/«Питание»).
 */
class RfbClient(private val socketPath: String, private val callback: Callback) {

    interface Callback {
        fun onConnected(width: Int, height: Int, name: String)
        /** Вызывается из сетевого потока после изменения кадра. */
        fun onFrame()
        fun onResize(width: Int, height: Int)
        fun onDisconnected(error: String?)
    }

    @Volatile private var socket = LocalSocket()
    private lateinit var input: DataInputStream
    private lateinit var output: DataOutputStream
    private val writer = Executors.newSingleThreadExecutor()
    @Volatile private var running = false
    @Volatile var extKeys = false; private set

    /** Буфер кадра. Доступ синхронизирован по [lock]. */
    @Volatile var bitmap: Bitmap? = null; private set
    val lock = Any()
    var fbWidth = 0; private set
    var fbHeight = 0; private set

    fun start() {
        running = true
        Thread({ runLoop() }, "rfb").start()
    }

    fun close() {
        running = false
        runCatching { socket.shutdownInput() }
        runCatching { socket.close() }
        writer.shutdownNow()
    }

    private fun runLoop() {
        var err: String? = null
        try {
            connectWithRetry()
            handshake()
            mainLoop()
        } catch (e: Exception) {
            if (running) err = e.message ?: e.toString()
        } finally {
            running = false
            runCatching { socket.close() }
            callback.onDisconnected(err)
        }
    }

    private fun connectWithRetry() {
        val addr = LocalSocketAddress(socketPath, LocalSocketAddress.Namespace.FILESYSTEM)
        val deadline = System.currentTimeMillis() + 30_000
        while (true) {
            try {
                val s = LocalSocket()
                socket = s
                s.connect(addr)
                break
            } catch (e: IOException) {
                runCatching { socket.close() }
                if (!running || System.currentTimeMillis() > deadline || !VmRunner.isActive) throw IOException("Нет соединения с экраном ВМ: ${e.message}")
                Thread.sleep(300)
            }
        }
        input = DataInputStream(BufferedInputStream(socket.inputStream, 1 shl 17))
        output = DataOutputStream(BufferedOutputStream(socket.outputStream, 1 shl 12))
    }

    private fun handshake() {
        val ver = ByteArray(12)
        input.readFully(ver)
        output.write("RFB 003.008\n".toByteArray()); output.flush()
        val n = input.readUnsignedByte()
        if (n == 0) throw IOException("VNC отказал: " + readString())
        val types = ByteArray(n).also { input.readFully(it) }
        if (!types.contains(1.toByte())) throw IOException("VNC требует пароль/шифрование — не поддерживается")
        output.writeByte(1); output.flush()
        val result = input.readInt()
        if (result != 0) throw IOException("Ошибка авторизации VNC: " + runCatching { readString() }.getOrDefault(""))
        output.writeByte(1); output.flush() // shared
        val w = input.readUnsignedShort()
        val h = input.readUnsignedShort()
        input.readFully(ByteArray(16)) // pixel format сервера
        val name = readString()
        allocate(w, h)

        // SetPixelFormat: 32 bpp, 24 depth, little-endian, true colour, BGRX в памяти → ARGB int
        output.writeByte(0); output.write(ByteArray(3))
        output.writeByte(32); output.writeByte(24); output.writeByte(0); output.writeByte(1)
        output.writeShort(255); output.writeShort(255); output.writeShort(255)
        output.writeByte(16); output.writeByte(8); output.writeByte(0)
        output.write(ByteArray(3))
        // SetEncodings
        val enc = intArrayOf(1 /*CopyRect*/, 0 /*Raw*/, -223 /*DesktopSize*/, -258 /*QEMU ext key*/)
        output.writeByte(2); output.writeByte(0); output.writeShort(enc.size)
        enc.forEach { output.writeInt(it) }
        output.flush()
        callback.onConnected(w, h, name)
        requestUpdate(false)
    }

    private fun readString(): String {
        val len = input.readInt()
        val b = ByteArray(len.coerceIn(0, 1 shl 20)); input.readFully(b)
        return String(b)
    }

    private fun allocate(w: Int, h: Int) {
        synchronized(lock) {
            fbWidth = w; fbHeight = h
            bitmap = Bitmap.createBitmap(w.coerceAtLeast(1), h.coerceAtLeast(1), Bitmap.Config.ARGB_8888).apply {
                eraseColor(0xFF000000.toInt())
            }
        }
    }

    private fun requestUpdate(incremental: Boolean) {
        val w = fbWidth; val h = fbHeight
        synchronized(output) {
            output.writeByte(3); output.writeByte(if (incremental) 1 else 0)
            output.writeShort(0); output.writeShort(0); output.writeShort(w); output.writeShort(h)
            output.flush()
        }
    }

    private var rowBytes = ByteArray(0)
    private var rowInts = IntArray(0)

    private fun mainLoop() {
        while (running) {
            when (val type = input.readUnsignedByte()) {
                0 -> { // FramebufferUpdate
                    input.readUnsignedByte()
                    val rects = input.readUnsignedShort()
                    var resized = false
                    for (r in 0 until rects) {
                        val x = input.readUnsignedShort(); val y = input.readUnsignedShort()
                        val w = input.readUnsignedShort(); val h = input.readUnsignedShort()
                        when (val enc = input.readInt()) {
                            0 -> readRaw(x, y, w, h)
                            1 -> {
                                val sx = input.readUnsignedShort(); val sy = input.readUnsignedShort()
                                copyRect(sx, sy, x, y, w, h)
                            }
                            -223 -> { allocate(w, h); resized = true; callback.onResize(w, h) }
                            -258 -> extKeys = true
                            else -> throw IOException("Неизвестная кодировка $enc")
                        }
                    }
                    callback.onFrame()
                    requestUpdate(!resized)
                }
                1 -> { // SetColourMapEntries — для true colour не нужен, просто пропускаем
                    input.readUnsignedByte(); input.readUnsignedShort()
                    val n = input.readUnsignedShort(); input.readFully(ByteArray(n * 6))
                }
                2 -> Unit // Bell
                3 -> { input.readFully(ByteArray(3)); val len = input.readInt(); input.skipBytes(len) }
                else -> throw IOException("Неизвестное сообщение VNC: $type")
            }
        }
    }

    private fun readRaw(x: Int, y: Int, w: Int, h: Int) {
        val n = w * 4
        if (rowBytes.size < n) { rowBytes = ByteArray(n); rowInts = IntArray(w) }
        val bb = ByteBuffer.wrap(rowBytes).order(ByteOrder.LITTLE_ENDIAN)
        for (row in 0 until h) {
            input.readFully(rowBytes, 0, n)
            bb.rewind()
            for (i in 0 until w) rowInts[i] = bb.getInt(i * 4) or -0x1000000
            synchronized(lock) {
                val bmp = bitmap ?: return@synchronized
                if (x + w <= bmp.width && y + row < bmp.height) bmp.setPixels(rowInts, 0, w, x, y + row, w, 1)
            }
        }
    }

    private fun copyRect(sx: Int, sy: Int, x: Int, y: Int, w: Int, h: Int) {
        synchronized(lock) {
            val bmp = bitmap ?: return
            if (sx + w > bmp.width || sy + h > bmp.height || x + w > bmp.width || y + h > bmp.height) return
            val px = IntArray(w * h)
            bmp.getPixels(px, 0, w, sx, sy, w, h)
            bmp.setPixels(px, 0, w, x, y, w, h)
        }
    }

    // ---------- ввод ----------

    private fun send(block: DataOutputStream.() -> Unit) {
        if (!running) return
        runCatching {
            writer.execute {
                runCatching { synchronized(output) { output.block(); output.flush() } }
            }
        }
    }

    fun pointer(mask: Int, x: Int, y: Int) = send {
        writeByte(5); writeByte(mask)
        writeShort(x.coerceIn(0, (fbWidth - 1).coerceAtLeast(0)))
        writeShort(y.coerceIn(0, (fbHeight - 1).coerceAtLeast(0)))
    }

    /** Клавиша: keysym X11 + XT скан-код (с битом 0x80 для префикса E0). */
    fun key(down: Boolean, keysym: Int, scancode: Int) = send {
        if (extKeys && scancode != 0) {
            writeByte(255); writeByte(0); writeShort(if (down) 1 else 0)
            writeInt(keysym); writeInt(scancode)
        } else if (keysym != 0) {
            writeByte(4); writeByte(if (down) 1 else 0); writeShort(0); writeInt(keysym)
        }
    }

    fun tap(k: KeyMap.Key) { key(true, k.keysym, k.scancode); key(false, k.keysym, k.scancode) }

    /** Комбинация: зажать все, отпустить в обратном порядке. */
    fun combo(vararg keys: KeyMap.Key) {
        keys.forEach { key(true, it.keysym, it.scancode) }
        keys.reversed().forEach { key(false, it.keysym, it.scancode) }
    }

    fun typeChar(c: Char) {
        val m = KeyMap.forChar(c)
        if (m == null) { // не US-раскладка: пробуем голый keysym
            val ks = if (c.code < 0x100) c.code else 0x01000000 or c.code
            key(true, ks, 0); key(false, ks, 0); return
        }
        if (m.second) key(true, KeyMap.SHIFT.keysym, KeyMap.SHIFT.scancode)
        tap(m.first)
        if (m.second) key(false, KeyMap.SHIFT.keysym, KeyMap.SHIFT.scancode)
    }
}
