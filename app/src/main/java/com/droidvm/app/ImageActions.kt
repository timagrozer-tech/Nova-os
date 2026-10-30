package com.droidvm.app

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import android.text.InputType
import android.widget.EditText
import android.widget.RadioButton
import android.widget.RadioGroup
import java.io.File

/**
 * Общие действия с библиотекой образов: импорт с телефона (через системный выбор файла,
 * с копированием в папку приложения) и создание пустого диска.
 */
abstract class ImageActivityBase : Activity() {

    private var pendingImport: ((File) -> Unit)? = null

    fun importFromDevice(onDone: (File) -> Unit) {
        pendingImport = onDone
        val i = Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*")
        startActivityForResult(i, REQ_IMPORT)
    }

    @Deprecated("Activity API")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == REQ_IMPORT && resultCode == RESULT_OK) {
            val uri = data?.data ?: return
            val cb = pendingImport ?: {}
            copyIn(uri, cb)
        }
    }

    private fun copyIn(uri: Uri, onDone: (File) -> Unit) {
        var name = "image"
        var size = -1L
        contentResolver.query(uri, null, null, null, null)?.use { c ->
            if (c.moveToFirst()) {
                val ni = c.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                val si = c.getColumnIndex(OpenableColumns.SIZE)
                if (ni >= 0) name = c.getString(ni) ?: name
                if (si >= 0 && !c.isNull(si)) size = c.getLong(si)
            }
        }
        val free = VmStore.imagesDir(this).usableSpace
        if (size > 0 && size > free) {
            Ui.alert(this, "Недостаточно места", "Файл ${humanSize(size)}, свободно ${humanSize(free)}.")
            return
        }
        val target = VmStore.uniqueImageFile(this, name)
        val cancelled = java.util.concurrent.atomic.AtomicBoolean(false)
        val (dlg, upd) = Ui.progress(this, "Импорт: $name") { cancelled.set(true) }
        Thread {
            val tmp = File(target.parentFile, target.name + ".part")
            val err = runCatching {
                contentResolver.openInputStream(uri)!!.use { input ->
                    tmp.outputStream().use { out ->
                        val buf = ByteArray(1 shl 20)
                        var total = 0L
                        var lastUpd = 0L
                        while (true) {
                            if (cancelled.get()) throw InterruptedException("Отменено")
                            val n = input.read(buf)
                            if (n < 0) break
                            out.write(buf, 0, n)
                            total += n
                            val now = System.currentTimeMillis()
                            if (now - lastUpd > 250) {
                                lastUpd = now
                                val p = if (size > 0) (total * 100 / size).toInt() else -1
                                upd(p, "${humanSize(total)}${if (size > 0) " из ${humanSize(size)}" else ""}")
                            }
                        }
                    }
                }
                if (!tmp.renameTo(target)) throw java.io.IOException("Не удалось сохранить файл")
            }.exceptionOrNull()
            if (err != null) tmp.delete()
            runOnUiThread {
                dlg.dismiss()
                if (err == null) onDone(target)
                else if (err !is InterruptedException) Ui.alert(this, "Ошибка импорта", err.message ?: err.toString())
            }
        }.start()
    }

    fun createDiskDialog(onDone: (File) -> Unit) {
        val box = Ui.vbox(this, 20)
        val nameEt = EditText(this).apply { setText("disk.qcow2"); hint = "Имя файла" }
        val sizeEt = EditText(this).apply { setText("16"); inputType = InputType.TYPE_CLASS_NUMBER; hint = "Размер, ГБ" }
        val grp = RadioGroup(this)
        val q = RadioButton(this).apply { text = "qcow2 (растёт по мере заполнения)"; id = 1; isChecked = true }
        val r = RadioButton(this).apply { text = "raw (сразу резервирует место, чуть быстрее)"; id = 2 }
        grp.addView(q); grp.addView(r)
        box.addView(Ui.label(this, "Имя файла")); box.addView(nameEt)
        box.addView(Ui.label(this, "Размер, ГБ")); box.addView(sizeEt)
        box.addView(grp)
        AlertDialog.Builder(this).setTitle("Новый пустой диск").setView(box)
            .setPositiveButton("Создать") { _, _ ->
                val qcow = grp.checkedRadioButtonId == 1
                var n = nameEt.text.toString().trim().ifBlank { "disk" }
                n = n.substringBeforeLast('.').ifBlank { n } + if (qcow) ".qcow2" else ".img"
                val gb = sizeEt.text.toString().toIntOrNull()?.coerceIn(1, 2048) ?: 16
                val file = VmStore.uniqueImageFile(this, n)
                val (dlg, upd) = Ui.progress(this, "Создание диска")
                upd(-1, "${file.name}, $gb ГБ")
                Thread {
                    val err = QemuEnv(this).createDisk(file, gb, qcow)
                    runOnUiThread {
                        dlg.dismiss()
                        if (err == null) onDone(file) else Ui.alert(this, "Ошибка", err)
                    }
                }.start()
            }.setNegativeButton("Отмена", null).show()
    }

    companion object { const val REQ_IMPORT = 4242 }
}
