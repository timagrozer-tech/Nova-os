package com.droidvm.app

import android.content.Context
import android.net.Uri
import android.provider.DocumentsContract
import java.io.File
import java.io.IOException
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Копирование файлов в папку, выбранную через системный выбор Android:
 * USB-флешка (OTG), карта памяти, «Загрузки», облачные диски.
 * Создаётся папка «DroidVM <дата>», внутри сохраняется структура подпапок.
 */
object Exporter {

    data class Item(val file: File, val relPath: String)

    const val FAT32_LIMIT = 4L * 1024 * 1024 * 1024 - 1

    fun copyToTree(ctx: Context, tree: Uri, items: List<Item>, cancelled: AtomicBoolean,
                   progress: (Int, String) -> Unit): File? {
        val cr = ctx.contentResolver
        val rootDoc = DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree))
        val stamp = SimpleDateFormat("yyyy-MM-dd HH-mm", Locale.US).format(Date())
        val top = DocumentsContract.createDocument(cr, rootDoc, DocumentsContract.Document.MIME_TYPE_DIR, "DroidVM $stamp")
            ?: throw IOException("Не удалось создать папку на выбранном носителе")
        val dirs = HashMap<String, Uri>().apply { put("", top) }
        fun dirFor(rel: String): Uri {
            dirs[rel]?.let { return it }
            val parent = dirFor(rel.substringBeforeLast('/', ""))
            val d = DocumentsContract.createDocument(cr, parent, DocumentsContract.Document.MIME_TYPE_DIR, rel.substringAfterLast('/'))
                ?: throw IOException("Не удалось создать папку $rel")
            dirs[rel] = d
            return d
        }
        val total = items.sumOf { it.file.length() }
        var done = 0L
        val t0 = System.currentTimeMillis()
        val buf = ByteArray(4 shl 20)
        for (it in items) {
            val parentRel = it.relPath.substringBeforeLast('/', "")
            val name = it.relPath.substringAfterLast('/')
            val doc = DocumentsContract.createDocument(cr, dirFor(parentRel), "application/octet-stream", name)
                ?: throw IOException("Не удалось создать файл $name")
            try {
                it.file.inputStream().use { inp ->
                    (cr.openOutputStream(doc, "w") ?: throw IOException("Носитель недоступен")).use { out ->
                        var last = 0L
                        while (true) {
                            if (cancelled.get()) throw InterruptedException("Отменено")
                            val n = inp.read(buf); if (n < 0) break
                            out.write(buf, 0, n); done += n
                            val now = System.currentTimeMillis()
                            if (now - last > 400) {
                                last = now
                                val sec = (now - t0) / 1000.0
                                val sp = if (sec > 1) done / sec else 0.0
                                val left = if (sp > 0) ((total - done) / sp).toLong() else -1
                                progress((done * 100 / total.coerceAtLeast(1)).toInt(),
                                    "$name\n${humanSize(done)} из ${humanSize(total)} · ${humanSize(sp.toLong())}/с" +
                                        if (left >= 0) " · осталось ${left / 60}:${String.format(Locale.US, "%02d", left % 60)}" else "")
                            }
                        }
                    }
                }
            } catch (e: Throwable) {
                runCatching { DocumentsContract.deleteDocument(cr, doc) }
                if (e is InterruptedException) throw e
                val msg = e.message.orEmpty()
                throw IOException(when {
                    it.file.length() > FAT32_LIMIT || msg.contains("EFBIG") || msg.contains("too large", true) ->
                        "Файл «$name» больше 4 ГБ, а флешка, похоже, в формате FAT32 — он такие не принимает. " +
                            "Отформатируйте её в exFAT (Настройки → Хранилище) или выберите другой носитель."
                    msg.contains("ENOSPC") || msg.contains("No space", true) -> "На носителе закончилось место (файл «$name»)."
                    else -> "Ошибка записи «$name»: $msg"
                })
            }
        }
        return null
    }
}
