package com.droidvm.app

import android.content.Context
import org.json.JSONObject
import java.io.File

/** Хранилище конфигураций ВМ и библиотеки образов. */
object VmStore {

    fun vmsDir(ctx: Context) = File(ctx.filesDir, "vms").apply { mkdirs() }

    fun vmDir(ctx: Context, id: String) = File(vmsDir(ctx), id).apply { mkdirs() }

    /**
     * Папка с образами (ISO, img, qcow2, ядра). Это app-specific external storage:
     * Android/data/com.droidvm.app/files/images — туда можно положить файлы и вручную по USB.
     */
    fun imagesDir(ctx: Context): File {
        val ext = ctx.getExternalFilesDir("images")
        val dir = ext ?: File(ctx.filesDir, "images")
        dir.mkdirs()
        return dir
    }

    fun list(ctx: Context): List<VmConfig> =
        vmsDir(ctx).listFiles()?.mapNotNull { dir ->
            val f = File(dir, "config.json")
            if (!f.exists()) null else runCatching { VmConfig.fromJson(JSONObject(f.readText())) }.getOrNull()
        }?.sortedBy { it.name.lowercase() } ?: emptyList()

    fun get(ctx: Context, id: String): VmConfig? {
        val f = File(vmDir(ctx, id), "config.json")
        return if (f.exists()) runCatching { VmConfig.fromJson(JSONObject(f.readText())) }.getOrNull() else null
    }

    fun save(ctx: Context, cfg: VmConfig) {
        File(vmDir(ctx, cfg.id), "config.json").writeText(cfg.toJson().toString(2))
    }

    fun delete(ctx: Context, id: String) {
        File(vmsDir(ctx), id).deleteRecursively()
    }

    fun images(ctx: Context): List<File> =
        imagesDir(ctx).listFiles()?.filter { it.isFile }?.sortedBy { it.name.lowercase() } ?: emptyList()

    /** Какие ВМ ссылаются на файл (чтобы предупредить перед удалением). */
    fun usersOf(ctx: Context, path: String): List<VmConfig> = list(ctx).filter { c ->
        c.iso == path || c.kernel == path || c.initrd == path || c.disks.contains(path)
    }

    fun uniqueImageFile(ctx: Context, name: String): File {
        val safe = name.replace(Regex("[^A-Za-z0-9._ \\-()\\[\\]а-яА-ЯёЁ]"), "_").ifBlank { "image" }
        val dir = imagesDir(ctx)
        var f = File(dir, safe)
        if (!f.exists()) return f
        val dot = safe.lastIndexOf('.')
        val base = if (dot > 0) safe.substring(0, dot) else safe
        val ext = if (dot > 0) safe.substring(dot) else ""
        var i = 2
        while (f.exists()) { f = File(dir, "$base ($i)$ext"); i++ }
        return f
    }
}

fun humanSize(bytes: Long): String {
    if (bytes < 1024) return "$bytes Б"
    val units = arrayOf("КБ", "МБ", "ГБ", "ТБ")
    var v = bytes.toDouble() / 1024
    var u = 0
    while (v >= 1024 && u < units.size - 1) { v /= 1024; u++ }
    return String.format(java.util.Locale.US, "%.1f %s", v, units[u])
}
