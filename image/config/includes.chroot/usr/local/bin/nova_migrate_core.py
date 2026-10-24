#!/usr/bin/env python3
"""NOVA Migration engine. Windows source is read-only; only a NEW private destination is written.

Portable testable Python3 core. No elevation, no commands for disk changes,
no registry modifications, no credentials/cookies/password imports.
"""
from __future__ import annotations

import csv
import html
import json
import os
from pathlib import Path
import shutil
import sqlite3
import tempfile
from urllib.parse import quote

CATEGORIES = {
    'desktop': ('Рабочий стол', ('Desktop',)),
    'documents': ('Документы', ('Documents',)),
    'downloads': ('Загрузки', ('Downloads',)),
    'pictures': ('Изображения', ('Pictures',)),
    'videos': ('Видео', ('Videos',)),
    'music': ('Музыка', ('Music',)),
    'saved_games': ('Сохранения игр', ('Saved Games', 'Documents/My Games')),
    'favorites': ('Избранное Windows', ('Favorites',)),
    'themes': ('Темы и обои', ('AppData/Roaming/Microsoft/Windows/Themes',)),
}
DEFAULT_SELECTION = ('desktop', 'documents', 'pictures', 'videos', 'music')
MAX_SCAN = 200000


def plausible_windows_profile(root: Path) -> bool:
    return root.is_dir() and (
        (root/'NTUSER.DAT').is_file() or
        ((root/'AppData').is_dir() and any(
            (root/name).is_dir() for name in ('Desktop', 'Documents', 'Downloads', 'Pictures')))
    )


def filename_safe(value: str) -> str:
    return ''.join(ch if ch.isalnum() or ch in '._- ' else '_' for ch in value).strip()[:90] or 'user'


def iter_regular_files(source: Path):
    """Do not traverse or copy symlinks/junctions; skip Windows desktop.ini metadata."""
    if not source.is_dir() or source.is_symlink():
        return
    count = 0
    for current, directories, files in os.walk(source, followlinks=False):
        directories[:] = [d for d in sorted(directories) if not (Path(current)/d).is_symlink()]
        for name in sorted(files):
            if name.casefold() == 'desktop.ini':
                continue
            src = Path(current) / name
            if src.is_symlink() or not src.is_file():
                continue
            count += 1
            if count > MAX_SCAN:
                raise ValueError('Превышен предел файлов на одну папку; импортируйте меньшими частями')
            yield src


def browser_sources(profile: Path):
    """Include Default, Profile 1… (Chrome/Edge) without accessing credentials."""
    for browser, base in (
        ('Chrome', profile/'AppData/Local/Google/Chrome/User Data'),
        ('Edge', profile/'AppData/Local/Microsoft/Edge/User Data'),
    ):
        if base.is_dir() and not base.is_symlink():
            for directory in sorted(base.iterdir()):
                if directory.is_dir() and not directory.is_symlink() and (
                    directory.name == 'Default' or directory.name.startswith('Profile ')):
                    yield browser + '-' + directory.name.replace(' ', '_'), directory/'Bookmarks'
    firefox = profile/'AppData/Roaming/Mozilla/Firefox/Profiles'
    if firefox.is_dir() and not firefox.is_symlink():
        for db in sorted(firefox.glob('*/places.sqlite')):
            if not db.is_symlink() and not db.parent.is_symlink():
                yield 'Firefox-' + db.parent.name, db


def chrome_bookmarks(path: Path):
    data = json.loads(path.read_text(encoding='utf-8'))
    output = []
    def walk(node):
        if isinstance(node, dict):
            if node.get('type') == 'url':
                url = node.get('url', '')
                if isinstance(url, str) and url.startswith(('http://', 'https://')):
                    output.append((str(node.get('name', 'Закладка')), url))
            for child in node.get('children', []):
                walk(child)
        elif isinstance(node, list):
            for child in node: walk(child)
    walk(list(data.get('roots', {}).values()))
    return output


def firefox_bookmarks(path: Path):
    # immutable read-only SQLite connection avoids writing journal files to Windows.
    url = 'file:' + quote(str(path.resolve()), safe='/') + '?mode=ro&immutable=1'
    with sqlite3.connect(url, uri=True) as connection:
        rows = connection.execute('''SELECT COALESCE(b.title,p.title,'Закладка'),p.url
            FROM moz_bookmarks b JOIN moz_places p ON b.fk=p.id
            WHERE b.type=1 AND (p.url LIKE 'http://%' OR p.url LIKE 'https://%')''')
        return [(name, value) for name, value in rows]


def save_bookmarks(profile: Path, destination: Path, problems: list[str]):
    total = 0
    for name, path in browser_sources(profile):
        if not path.is_file() or path.is_symlink():
            continue
        try:
            bookmarks = firefox_bookmarks(path) if name.startswith('Firefox') else chrome_bookmarks(path)
            if not bookmarks: continue
            dest = destination/'Закладки браузеров'
            dest.mkdir(parents=True, exist_ok=True)
            # Netscape Bookmark File format imports into mainstream browsers.
            lines = ['<!DOCTYPE NETSCAPE-Bookmark-file-1>', '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
                     '<TITLE>NOVA bookmarks</TITLE>', '<H1>NOVA bookmarks</H1>', '<DL><p>']
            for title, link in bookmarks:
                lines.append(f'<DT><A HREF="{html.escape(link,quote=True)}">{html.escape(title)}</A>')
            lines.append('</DL><p>')
            (dest/(filename_safe(name) + '.html')).write_text('\n'.join(lines)+'\n', encoding='utf-8')
            total += len(bookmarks)
        except (OSError, ValueError, sqlite3.Error, KeyError, TypeError) as exc:
            problems.append(f'{name}: не удалось экспортировать закладки ({exc})')
    return total


def program_inventory(profile: Path, destination: Path, problems: list[str]):
    """Catalog, not executable migration. Do not promise that Windows apps run on Linux."""
    entries = set()
    user_shortcuts = profile/'AppData/Roaming/Microsoft/Windows/Start Menu/Programs'
    volume_root = profile.parent.parent if profile.parent.name.casefold() == 'users' else None
    shared = volume_root/'ProgramData/Microsoft/Windows/Start Menu/Programs' if volume_root else None
    for label, directory in (('пользовательские ярлыки', user_shortcuts), ('общие ярлыки', shared)):
        if directory is None or not directory.is_dir(): continue
        try:
            for item in iter_regular_files(directory):
                if item.suffix.casefold() == '.lnk':
                    entries.add((item.stem, label, str(item.relative_to(directory))))
        except (OSError, ValueError) as exc:
            problems.append(f'Каталог программ: {exc}')
    # Optionally read a winget export generated under Windows (read-only JSON).
    winget_files = (
        profile/'Desktop/NOVA-Export/winget-apps.json',
        profile/'Documents/NOVA-Export/winget-apps.json',
    )
    for file in winget_files:
        if file.is_file() and not file.is_symlink():
            try:
                data = json.loads(file.read_text(encoding='utf-8-sig'))
                for source in data.get('Sources', []):
                    for package in source.get('Packages', []):
                        entries.add((str(package.get('PackageIdentifier', '')),
                                     'winget (требует переустановки)', str(package.get('Version', ''))))
            except (OSError, ValueError, TypeError) as exc:
                problems.append(f'Список winget: {exc}')
    if entries:
        output = destination/'Программы_Windows_каталог.csv'
        with output.open('w', encoding='utf-8-sig', newline='') as f:
            writer = csv.writer(f); writer.writerow(['Название/ID', 'Источник', 'Ярлык или версия'])
            writer.writerows(sorted(entries, key=lambda x: x[0].casefold()))
    return len(entries)


def migrate(profile: Path, selected, output_root: Path, extra_folder=None, progress=None, cancelled=None):
    """Always create a unique new subdirectory. Never deletes/overwrites Windows source.

    New Linux filesystem destination must be chosen by the user; this core rejects
    destination equal to/inside the Windows source tree, and reject sources pointing
    to the output root to avoid recursive self-copying.
    """
    profile = Path(profile).expanduser().resolve(strict=True)
    output_root = Path(output_root).expanduser().resolve(strict=True)
    if not plausible_windows_profile(profile):
        raise ValueError('Выберите именно папку профиля Windows: C:\\Users\\имя (раздел должен быть смонтирован)')
    if profile == output_root or profile in output_root.parents or output_root in profile.parents:
        raise ValueError('Папка назначения должна находиться на другом разделе, а не внутри профиля Windows')
    selected = list(dict.fromkeys(selected))
    if any(s not in CATEGORIES and s not in ('bookmarks', 'programs', 'extra') for s in selected):
        raise ValueError('Неизвестная категория импорта')
    if not selected: raise ValueError('Выберите хотя бы одну категорию')
    extra = Path(extra_folder).expanduser().resolve(strict=True) if extra_folder else None
    if 'extra' in selected:
        if extra is None or not extra.is_dir() or extra.is_symlink():
            raise ValueError('Для дополнительной папки укажите существующий каталог')
        if extra == output_root or extra in output_root.parents or output_root in extra.parents:
            raise ValueError('Нельзя копировать каталог назначения внутрь самого себя')
    root = Path(tempfile.mkdtemp(prefix='NOVA-'+filename_safe(profile.name)+'-', dir=output_root))
    root.chmod(0o700)
    result = {'windows_profile': str(profile), 'destination': str(root), 'selected': selected,
              'copied': 0, 'bytes': 0, 'failed': [], 'skipped_links': 'symbolic links / junctions',
              'bookmarks': 0, 'programs_catalogued': 0, 'cancelled': False}
    jobs = [(label, profile/rel, root/'Данные'/label)
            for key in selected if key in CATEGORIES
            for label, paths in (CATEGORIES[key],) for rel in paths]
    if 'extra' in selected: jobs.append(('Дополнительно', extra, root/'Данные'/'Дополнительно'))
    try:
        for label, srcdir, destdir in jobs:
            if not srcdir.is_dir() or srcdir.is_symlink():
                result['failed'].append(f'{label}: исходная папка отсутствует')
                continue
            for src in iter_regular_files(srcdir):
                if cancelled and cancelled():
                    result['cancelled'] = True
                    break
                target = destdir/src.relative_to(srcdir)
                try:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(src, target, follow_symlinks=False)
                    result['copied'] += 1
                    result['bytes'] += src.stat().st_size
                    if progress and result['copied'] % 50 == 0:
                        progress(f'{label}: скопировано {result["copied"]} файлов')
                except (OSError, ValueError) as exc:
                    result['failed'].append(f'{src}: {exc}')
            if result['cancelled']: break
        if not result['cancelled']:
            if 'bookmarks' in selected:
                result['bookmarks'] = save_bookmarks(profile, root, result['failed'])
            if 'programs' in selected:
                result['programs_catalogued'] = program_inventory(profile, root, result['failed'])
    finally:
        (root/'ОТЧЁТ-О-ПЕРЕНОСЕ.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
        (root/'ПРОЧТИ-МЕНЯ.txt').write_text(
            'NOVA Migration — копия выбранных данных из Windows. Windows не изменена.\n'
            'Программы в CSV — только каталог для последующей установки, НЕ перенесённые программы.\n'
            'Пароли, cookies, ключи, лицензии и профили браузеров не переносятся автоматически.\n'
            'Проверьте целостность важных файлов вручную, прежде чем удалять оригиналы.\n', encoding='utf-8')
    return result
