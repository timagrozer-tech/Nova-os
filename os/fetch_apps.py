#!/usr/bin/env python3
"""Скачать приложения для DroidVM OS из репозиториев F-Droid с проверкой SHA-256."""
import hashlib, json, os, sys, urllib.request

OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)

def get(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'DroidVM-build'})
    with urllib.request.urlopen(req, timeout=300) as r:
        return r.read()

def pick(index, pkg, prefer_suggested=True, skip=lambda p: False):
    apps = {a['packageName']: a for a in index.get('apps', [])}
    pk = [p for p in index['packages'].get(pkg, []) if not skip(p)]
    nat = [p for p in pk if not p.get('nativecode') or 'arm64-v8a' in p.get('nativecode', [])]
    sug = apps.get(pkg, {}).get('suggestedVersionCode')
    if prefer_suggested and sug:
        s = [p for p in nat if str(p['versionCode']) == str(sug)]
        if s:
            return s[0]
    return max(nat, key=lambda p: p['versionCode'])

def fetch(repo, index, pkg, name, **kw):
    p = pick(index, pkg, **kw)
    data = get(f"{repo}/{p['apkName']}")
    if hashlib.sha256(data).hexdigest() != p['hash']:
        sys.exit(f'{pkg}: неверная контрольная сумма')
    path = os.path.join(OUT, name)
    open(path, 'wb').write(data)
    print(f"{name}: {pkg} {p.get('versionName')} ({len(data)//1024} КБ)")

MICROG = 'https://microg.org/fdroid/repo'
FDROID = 'https://f-droid.org/repo'
mi = json.loads(get(f'{MICROG}/index-v1.json'))
hw = lambda p: '-hw' in str(p.get('versionName', '')) or '-hw' in p.get('apkName', '')
# порядок = порядок установки
fetch(MICROG, mi, 'com.google.android.gms', '1-microg-services.apk', prefer_suggested=False, skip=hw)
fetch(MICROG, mi, 'com.android.vending', '2-microg-companion.apk', prefer_suggested=False, skip=hw)
fi = json.loads(get(f'{FDROID}/index-v1.json'))
fetch(FDROID, fi, 'org.fdroid.fdroid', '3-fdroid.apk')
fetch(FDROID, fi, 'com.aurora.store', '4-aurora-store.apk')
