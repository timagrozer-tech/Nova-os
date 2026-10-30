#!/usr/bin/env python3
"""Проверка каталога GSI (та же логика, что в GsiCatalog.kt): находит свежие файлы и их размер."""
import re, urllib.request, urllib.parse

UA = {'User-Agent': 'Mozilla/5.0 (Linux; Android) DroidVM'}
def get(u):
    r = urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60)
    return r.geturl(), r.read().decode('utf-8', 'replace')
def size(u):
    r = urllib.request.urlopen(urllib.request.Request(u, headers={**UA, 'Range': 'bytes=0-0'}), timeout=60)
    cr = r.headers.get('Content-Range')
    return (int(cr.split('/')[1]) if cr else int(r.headers.get('Content-Length', 0))), r.status

A = '(?i)arm64'
EXT = r'\.(img\.xz|xz|zip|img\.gz|7z)$'
CAT = [
 ('AOSP 16 + Google Play (ponces)', 'gh', 'ponces/treble_aosp', '/', [A + r'.*gapps.*' + EXT]),
 ('AOSP 16 чистый (ponces)', 'gh', 'ponces/treble_aosp', '/', [A + r'.*(vanilla|bvN).*' + EXT, A + r'(?!.*gapps).*' + EXT]),
 ('crDroid 12', 'gh', 'Doze-off/crdroid_gsi_treble', '/', [A + r'.*(bvN|vanilla).*' + EXT, A + r'.*' + EXT]),
 ('LineageOS 23 (Andy Yan)', 'sf', 'andyyan-gsi', '/', [r'(?i)lineage-2[3-9].*gsi_arm64\.img\.(gz|xz)$', r'(?i)lineage-2[3-9].*arm64.*\.(img\.gz|img\.xz|zip|7z)$']),
 ('LineageOS 23.2 (MisterZtr)', 'sf', 'misterztr-gsi', '/LineageOS', [r'(?i)lineage.*gsi_arm64_bvN.*\.(7z|xz|zip|gz)$']),
 ('Google GMS', 'g', 'https://developer.android.com/about/versions/16/gsi-release-notes', '', [r'gsi_gms_arm64-[^"\'\s<>]+\.zip']),
 ('Google AOSP', 'g', 'https://developer.android.com/about/versions/16/gsi-release-notes', '', [r'aosp_arm64-[^"\'\s<>]+\.zip']),
]
def pick(pats, names):
    for p in pats:
        for n in names:
            if re.search(p, n): return n
for title, kind, src, path, pats in CAT:
    try:
        if kind == 'gh':
            fu, _ = get(f'https://github.com/{src}/releases/latest')
            tag = fu.split('/releases/tag/')[1].split('?')[0]
            _, html = get(f'https://github.com/{src}/releases/expanded_assets/{tag}')
            names = list(dict.fromkeys(urllib.parse.unquote(m) for m in re.findall(rf'/{re.escape(src)}/releases/download/{re.escape(tag)}/([^"?#]+)', html)))
            n = pick(pats, names)
            if not n: raise Exception(f'нет подходящего файла среди {names}')
            url = f'https://github.com/{src}/releases/download/{tag}/' + urllib.parse.quote(n)
        elif kind == 'sf':
            _, rss = get(f'https://sourceforge.net/projects/{src}/rss?path={path}')
            links = re.findall(r'<link>(https://sourceforge\.net/projects/[^<]+/download)</link>', rss)
            by = {urllib.parse.unquote(l[:-len('/download')].rsplit('/', 1)[1]): l for l in links}
            n = pick(pats, list(by))
            if not n: raise Exception(f'нет подходящего файла, всего {len(by)}: {list(by)[:8]}')
            url = by[n]
        else:
            _, html = get(src)
            m = next((re.search(p, html) for p in pats if re.search(p, html)), None)
            if not m: raise Exception('файл не найден на странице')
            n = m.group(0)
            url = re.search(r'https://dl\.google\.com/[^"\'\s<>]*' + re.escape(n), html).group(0)
        sz, st = size(url)
        print(f'::notice title={title}::{n} — {sz/2**30:.2f} ГБ (HTTP {st}, Range {"да" if st == 206 else "нет"})')
    except Exception as e:
        print(f'::warning title={title}::{e}')
