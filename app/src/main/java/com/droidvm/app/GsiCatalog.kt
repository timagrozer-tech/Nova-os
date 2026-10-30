package com.droidvm.app

import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/**
 * Каталог популярных GSI (универсальных прошивок Android) для ARM64.
 * Ссылки на свежие версии находятся при открытии — через обычные страницы релизов
 * (GitHub, SourceForge, developer.android.com), без GitHub API и его лимитов.
 */
object GsiCatalog {

    enum class Kind { GITHUB, SOURCEFORGE, GOOGLE }

    data class Entry(
        val id: String,
        val title: String,
        val about: String,
        val kind: Kind,
        /** GitHub: owner/repo; SourceForge: проект; Google: адрес страницы */
        val source: String,
        /** SourceForge: папка для RSS */
        val path: String = "/",
        /** Шаблоны имени файла по приоритету (первый найденный выигрывает) */
        val patterns: List<Regex>,
        /** Нужно принять лицензию до загрузки */
        val licenseUrl: String? = null,
        val homepage: String,
    )

    data class Resolved(val entry: Entry, val fileName: String, val url: String, val version: String)

    private val arm64 = "(?i)arm64"
    val entries = listOf(
        Entry("aosp-ponces", "AOSP 16 (TrebleDroid)", "Чистый Android от Google без лишнего, сборка ponces",
            Kind.GITHUB, "ponces/treble_aosp",
            patterns = listOf(Regex("$arm64.*bvN.*\\.(img\\.xz|xz|zip|img\\.gz|7z)$"), Regex("$arm64.*\\.(img\\.xz|xz|zip|img\\.gz|7z)$")),
            homepage = "https://github.com/ponces/treble_aosp"),
        Entry("crdroid", "crDroid 12 (Android 16)", "Много настроек внешнего вида и жестов",
            Kind.GITHUB, "Doze-off/crdroid_gsi_treble",
            patterns = listOf(Regex("$arm64.*(bvN|vanilla).*\\.(img\\.xz|xz|zip|img\\.gz|7z)$"), Regex("$arm64.*\\.(img\\.xz|xz|zip|img\\.gz|7z)$")),
            homepage = "https://github.com/Doze-off/crdroid_gsi_treble"),
        Entry("lineage-andyyan", "LineageOS 23 GSI (Andy Yan)", "Самая известная GSI-сборка LineageOS",
            Kind.SOURCEFORGE, "andyyan-gsi", "/",
            patterns = listOf(Regex("(?i)lineage-2[3-9].*gsi_arm64\\.img\\.(gz|xz)$"), Regex("(?i)lineage-2[3-9].*arm64.*\\.(img\\.gz|img\\.xz|zip|7z)$")),
            homepage = "https://sourceforge.net/projects/andyyan-gsi/"),
        Entry("lineage-misterztr", "LineageOS 23.2 GSI (MisterZtr)", "LineageOS с правками для GSI, ванильная версия",
            Kind.SOURCEFORGE, "misterztr-gsi", "/LineageOS",
            patterns = listOf(Regex("(?i)lineage.*gsi_arm64_bvN.*\\.(7z|xz|zip|gz)$")),
            homepage = "https://sourceforge.net/projects/misterztr-gsi/"),
        Entry("google-gms", "Android 16 от Google + Google Play", "Официальный GSI Google с сервисами Google (бета-лицензия)",
            Kind.GOOGLE, "https://developer.android.com/about/versions/16/gsi-release-notes",
            patterns = listOf(Regex("gsi_gms_arm64-[^\"'\\s<>]+\\.zip")),
            licenseUrl = "https://developer.android.com/about/versions/16/gsi-release-notes",
            homepage = "https://developer.android.com/about/versions/16/gsi-release-notes"),
        Entry("google-aosp", "Android 16 от Google (AOSP)", "Официальный чистый GSI Google без сервисов",
            Kind.GOOGLE, "https://developer.android.com/about/versions/16/gsi-release-notes",
            patterns = listOf(Regex("aosp_arm64-[^\"'\\s<>]+\\.zip")),
            licenseUrl = "https://developer.android.com/about/versions/16/gsi-release-notes",
            homepage = "https://developer.android.com/about/versions/16/gsi-release-notes"),
    )

    private fun get(url: String): Pair<String, String> {
        val c = URL(url).openConnection() as HttpURLConnection
        c.connectTimeout = 20_000; c.readTimeout = 60_000; c.instanceFollowRedirects = true
        c.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android) DroidVM")
        if (c.responseCode !in 200..299) throw IOException("$url → HTTP ${c.responseCode}")
        val body = c.inputStream.bufferedReader().readText()
        return c.url.toString() to body
    }

    /** Найти ссылку на последнюю версию. Вызывать в фоне. */
    fun resolve(e: Entry): Resolved = when (e.kind) {
        Kind.GITHUB -> {
            val (finalUrl, _) = get("https://github.com/${e.source}/releases/latest")
            val tag = finalUrl.substringAfter("/releases/tag/", "").substringBefore('?')
            if (tag.isBlank()) throw IOException("У ${e.source} нет релизов")
            val (_, html) = get("https://github.com/${e.source}/releases/expanded_assets/$tag")
            val names = Regex("/${Regex.escape(e.source)}/releases/download/${Regex.escape(tag)}/([^\"?#]+)")
                .findAll(html).map { java.net.URLDecoder.decode(it.groupValues[1], "UTF-8") }.distinct().toList()
            val name = pick(e, names) ?: throw IOException("В релизе $tag нет подходящего файла arm64")
            Resolved(e, name, "https://github.com/${e.source}/releases/download/$tag/${java.net.URLEncoder.encode(name, "UTF-8").replace("+", "%20")}", tag)
        }
        Kind.SOURCEFORGE -> {
            val (_, rss) = get("https://sourceforge.net/projects/${e.source}/rss?path=${java.net.URLEncoder.encode(e.path, "UTF-8")}&limit=200")
            val links = Regex("<link>(https://sourceforge\\.net/projects/[^<]+/download)</link>").findAll(rss).map { it.groupValues[1] }.toList()
            val byName = links.associateBy { java.net.URLDecoder.decode(it.removeSuffix("/download").substringAfterLast('/'), "UTF-8") }
            // RSS отсортирован от новых к старым — берём первый подходящий
            val name = pick(e, byName.keys.toList()) ?: throw IOException("На SourceForge не найден файл arm64")
            Resolved(e, name, byName.getValue(name), Regex("20\\d{6}").find(name)?.value ?: name)
        }
        Kind.GOOGLE -> {
            val (_, html) = get(e.source)
            val m = e.patterns.firstNotNullOfOrNull { p -> p.find(html) } ?: throw IOException("На странице Google не найден файл")
            val name = m.value
            val url = Regex("https://dl\\.google\\.com/[^\"'\\s<>]*${Regex.escape(name)}").find(html)?.value
                ?: throw IOException("Не найдена ссылка на $name")
            Resolved(e, name, url, name.substringAfter("-").substringBefore("-"))
        }
    }

    private fun pick(e: Entry, names: List<String>): String? {
        for (p in e.patterns) names.firstOrNull { p.containsMatchIn(it) }?.let { return it }
        return null
    }
}
