#!/usr/bin/env python3
"""NOVA desktop modes for KDE Plasma 6 — pure logic, no side effects on import.

Modes are implemented with Plasma's own desktop-scripting API (the same API
the look-and-feel packages use), never by replacing the compositor or
plasmashell. Every apply is preceded by a backup of the user's Plasma layout
files, and "reset" returns to KDE's stock Breeze layout.
"""
from __future__ import annotations

import json
import re
import shutil
import time
from pathlib import Path

MODES = ('windows', 'dock', 'hybrid')
DENSITIES = ('compact', 'standard', 'touch')
MODE_TITLES = {
    'windows': 'Windows-like — панель снизу, приложения по центру',
    'dock': 'Dock-like — верхняя строка и док снизу',
    'hybrid': 'Hybrid — одна плавающая панель по центру',
}
PANEL_HEIGHT = {'compact': 40, 'standard': 48, 'touch': 56}
TOPBAR_HEIGHT = {'compact': 28, 'standard': 30, 'touch': 36}
CONTROL_HEIGHT = {'compact': 32, 'standard': 36, 'touch': 44}

LAUNCHERS = (
    'applications:org.kde.dolphin.desktop',
    'applications:firefox-esr.desktop',
    'applications:nova-control.desktop',
    'applications:org.kde.discover.desktop',
    'applications:org.kde.konsole.desktop',
)
WALLPAPER = 'file:///usr/share/wallpapers/NOVA/'
LAYOUT_FILES = ('plasma-org.kde.plasma.desktop-appletsrc', 'plasmashellrc')
LNF = {'light': 'org.nova.air.light.desktop', 'dark': 'org.nova.air.dark.desktop',
       'neon': 'org.nova.neon.desktop',   # NEON//SYS: see nova_neon_core
       'aurora': 'org.nova.aurora.desktop', 'sakura': 'org.nova.sakura.desktop',
       'ocean': 'org.nova.ocean.desktop'}   # NOVA styles: see nova_styles_core
KDE_DEFAULT_LNF = 'org.kde.breeze.desktop'

# Accent palette: (name, light-theme hex, dark-theme hex). Light values keep
# white text >= 4.5:1, dark values keep near-black text >= 4.5:1 (tested).
ACCENTS = (
    ('Синий NOVA', '#1f6feb', '#4c93ff'),
    ('Фиолетовый', '#7b3fd6', '#b18cff'),
    ('Малиновый', '#c2185b', '#ff7aa8'),
    ('Красный', '#c62828', '#ff7b72'),
    ('Оранжевый', '#b45309', '#ffb05c'),
    ('Зелёный', '#1f7a3f', '#5fd39a'),
    ('Бирюзовый', '#0f766e', '#4fd1c5'),
    ('Графит', '#4a5568', '#b7c3d4'),
)
HEX = re.compile(r'^#[0-9a-fA-F]{6}$')


def validate_mode(mode: str) -> str:
    if mode not in MODES:
        raise ValueError(f'Неизвестный режим: {mode!r}. Допустимо: {", ".join(MODES)}')
    return mode


def validate_density(density: str) -> str:
    if density not in DENSITIES:
        raise ValueError(f'Неизвестная плотность: {density!r}. Допустимо: {", ".join(DENSITIES)}')
    return density


def validate_accent(color: str) -> str:
    if not HEX.match(color or ''):
        raise ValueError('Цвет акцента должен быть в формате #RRGGBB')
    return color.lower()


def accent_rgb(color: str) -> str:
    color = validate_accent(color)
    return ','.join(str(int(color[i:i + 2], 16)) for i in (1, 3, 5))

# ---------------------------------------------------------------------------
# Plasma desktop scripts. Plain ES5 for Plasma's QJSEngine. All values are
# generated from validated constants: no user text is ever interpolated.
# ---------------------------------------------------------------------------

_JS_HELPERS = r'''
function novaTry(fn) { try { fn(); } catch (e) { print("NOVA: " + e); } }
function novaWidget(panel, plugin) { var w = null; novaTry(function () { w = panel.addWidget(plugin); }); return w; }
function novaSpacer(panel) {
  var s = novaWidget(panel, "org.kde.plasma.panelspacer");
  if (s) { novaTry(function () { s.currentConfigGroup = ["General"]; s.writeConfig("expanding", true); }); }
  return s;
}
function novaTasks(panel, launchers) {
  var t = novaWidget(panel, "org.kde.plasma.icontasks");
  if (t) {
    novaTry(function () {
      t.currentConfigGroup = ["General"];
      t.writeConfig("launchers", launchers);
      t.writeConfig("groupingStrategy", 1);
      t.writeConfig("showOnlyCurrentDesktop", false);
    });
  }
  return t;
}
function novaKickoff(panel) {
  var k = novaWidget(panel, "org.kde.plasma.kickoff");
  if (k) { novaTry(function () { k.currentConfigGroup = ["General"]; k.writeConfig("icon", "nova"); }); }
  return k;
}
function novaWallpaper() {
  var all = desktops();
  for (var i = 0; i < all.length; i++) {
    var d = all[i];
    novaTry(function () {
      d.wallpaperPlugin = "org.kde.image";
      d.currentConfigGroup = ["Wallpaper", "org.kde.image", "General"];
      d.writeConfig("Image", "%WALLPAPER%");
    });
  }
}
function novaRemovePanels() {
  var old = panels();
  for (var i = 0; i < old.length; i++) { novaTry(function () { old[i].remove(); }); }
}
'''


def _js_list(items) -> str:
    return '[' + ', '.join(json.dumps(i) for i in items) + ']'


def plasma_script(mode: str, density: str = 'standard', *, remove_existing: bool = True,
                  set_wallpaper: bool = True) -> str:
    """Return a Plasma desktop script implementing `mode`."""
    validate_mode(mode)
    validate_density(density)
    h = PANEL_HEIGHT[density]
    top = TOPBAR_HEIGHT[density]
    launchers = _js_list(LAUNCHERS)
    js = [_JS_HELPERS.replace('%WALLPAPER%', WALLPAPER).strip(), '']
    js.append(f'// NOVA desktop mode: {mode}, density: {density}')
    if remove_existing:
        js.append('novaRemovePanels();')
    if mode == 'windows':
        js += [
            'var p = new Panel;',
            'novaTry(function () { p.location = "bottom"; });',
            f'novaTry(function () {{ p.height = {h}; }});',
            'novaTry(function () { p.floating = true; });',      # Plasma 6 style: floats until a window touches it
            'novaTry(function () { p.lengthMode = "fill"; });',
            'novaTry(function () { p.hiding = "none"; });',
            'novaSpacer(p);',
            'novaKickoff(p);',
            f'novaTasks(p, {launchers});',
            'novaSpacer(p);',
            'novaWidget(p, "org.kde.plasma.systemtray");',
            'novaWidget(p, "org.kde.plasma.digitalclock");',
            'novaWidget(p, "org.kde.plasma.showdesktop");',
        ]
    elif mode == 'dock':
        js += [
            'var bar = new Panel;',
            'novaTry(function () { bar.location = "top"; });',
            f'novaTry(function () {{ bar.height = {top}; }});',
            'novaTry(function () { bar.floating = false; });',
            'novaTry(function () { bar.lengthMode = "fill"; });',
            'novaKickoff(bar);',
            'novaWidget(bar, "org.kde.plasma.appmenu");',
            'novaSpacer(bar);',
            'novaWidget(bar, "org.kde.plasma.systemtray");',
            'novaWidget(bar, "org.kde.plasma.digitalclock");',
            'var dock = new Panel;',
            'novaTry(function () { dock.location = "bottom"; });',
            f'novaTry(function () {{ dock.height = {h + 8}; }});',
            'novaTry(function () { dock.alignment = "center"; });',
            'novaTry(function () { dock.lengthMode = "fit"; });',
            'novaTry(function () { dock.floating = true; });',
            'novaTry(function () { dock.hiding = "dodgewindows"; });',
            f'novaTasks(dock, {launchers});',
        ]
    else:  # hybrid
        js += [
            'var p = new Panel;',
            'novaTry(function () { p.location = "bottom"; });',
            f'novaTry(function () {{ p.height = {h}; }});',
            'novaTry(function () { p.alignment = "center"; });',
            'novaTry(function () { p.lengthMode = "fit"; });',
            'novaTry(function () { p.floating = true; });',
            'novaTry(function () { p.hiding = "none"; });',
            'novaKickoff(p);',
            f'novaTasks(p, {launchers});',
            'novaWidget(p, "org.kde.plasma.marginsseparator");',
            'novaWidget(p, "org.kde.plasma.systemtray");',
            'novaWidget(p, "org.kde.plasma.digitalclock");',
        ]
    if set_wallpaper:
        js.append('novaWallpaper();')
    return '\n'.join(js) + '\n'


def lnf_layout_script(mode: str = 'windows', density: str = 'standard') -> str:
    """Script for look-and-feel `contents/layouts/org.kde.plasma.desktop-layout.js`
    (first login of a new user: there are no panels yet)."""
    return plasma_script(mode, density, remove_existing=False, set_wallpaper=True)

# ---------------------------------------------------------------------------
# Backups of the user's Plasma layout
# ---------------------------------------------------------------------------

def backup_root(home: str | Path | None = None) -> Path:
    return (Path(home) if home else Path.home()) / '.local/share/nova/layout-backups'


def make_backup(home: str | Path | None = None, label: str = 'auto', now: float | None = None) -> Path | None:
    """Copy Plasma layout files into a new timestamped folder. Never overwrites."""
    base = Path(home) if home else Path.home()
    config = base / '.config'
    present = [config / name for name in LAYOUT_FILES if (config / name).is_file()]
    if not present:
        return None
    if not re.fullmatch(r'[a-z0-9-]{1,24}', label):
        raise ValueError('bad backup label')
    stamp = time.strftime('%Y%m%d-%H%M%S', time.localtime(now if now is not None else time.time()))
    root = backup_root(base)
    root.mkdir(parents=True, exist_ok=True)
    target = root / f'{stamp}-{label}'
    suffix = 1
    while target.exists():
        suffix += 1
        target = root / f'{stamp}-{label}-{suffix}'
    target.mkdir(mode=0o700)
    for source in present:
        shutil.copy2(source, target / source.name)
    (target / 'nova-backup.json').write_text(json.dumps({'files': [p.name for p in present], 'label': label}),
                                             encoding='utf-8')
    return target


def list_backups(home: str | Path | None = None) -> list[Path]:
    root = backup_root(home)
    if not root.is_dir():
        return []
    return sorted((p for p in root.iterdir() if p.is_dir() and (p / 'nova-backup.json').is_file()), reverse=True)


def restore_files(backup: Path, home: str | Path | None = None) -> list[str]:
    """Copy files of `backup` back into ~/.config. Caller must stop plasmashell first.
    Only the known layout file names are accepted (no path traversal)."""
    base = Path(home) if home else Path.home()
    backup = Path(backup)
    root = backup_root(base).resolve()
    if backup.resolve().parent != root:
        raise ValueError('Резервная копия находится вне каталога NOVA')
    restored = []
    for name in LAYOUT_FILES:
        source = backup / name
        if source.is_file() and not source.is_symlink():
            shutil.copy2(source, base / '.config' / name)
            restored.append(name)
    if not restored:
        raise ValueError('В резервной копии нет файлов раскладки Plasma')
    return restored

# ---------------------------------------------------------------------------
# Command builders (fixed argv lists; executed by nova-layout)
# ---------------------------------------------------------------------------

def lookandfeel_command(variant: str, reset_layout: bool = False) -> list[str]:
    if variant == 'kde-default':
        package = KDE_DEFAULT_LNF
    elif variant in LNF:
        package = LNF[variant]
    else:
        raise ValueError('variant must be light, dark, neon, aurora, sakura, ocean or kde-default')
    argv = ['plasma-apply-lookandfeel', '--apply', package]
    if reset_layout:
        argv.append('--resetLayout')
    return argv


def accent_commands(color: str) -> list[list[str]]:
    rgb = accent_rgb(color)
    return [
        ['kwriteconfig6', '--file', 'kdeglobals', '--group', 'General', '--key', 'AccentColor', rgb],
        ['kwriteconfig6', '--file', 'kdeglobals', '--group', 'General', '--key', 'LastUsedCustomAccentColor', rgb],
    ]


ICON_THEMES = {'breeze': 'Breeze (стандарт KDE)', 'breeze-dark': 'Breeze тёмные',
               'Papirus': 'Papirus (проект с GitHub, пакет Debian)', 'Papirus-Dark': 'Papirus тёмные'}
CHANGEICONS = ('/usr/lib/x86_64-linux-gnu/libexec/plasma-changeicons', '/usr/libexec/plasma-changeicons')


def icon_command(theme: str, exists=None) -> list[str]:
    """Apply an icon theme live (plasma-changeicons) or via kdeglobals."""
    from os.path import exists as _exists
    exists = exists or _exists
    if theme not in ICON_THEMES:
        raise ValueError('icon theme must be one of: ' + ', '.join(ICON_THEMES))
    for tool in CHANGEICONS:
        if exists(tool):
            return [tool, theme]
    return ['kwriteconfig6', '--file', 'kdeglobals', '--group', 'Icons', '--key', 'Theme', theme]


def animation_command(level: str) -> list[str]:
    factors = {'off': '0', 'fast': '0.5', 'standard': '1'}
    if level not in factors:
        raise ValueError('animation level must be off, fast or standard')
    return ['kwriteconfig6', '--file', 'kdeglobals', '--group', 'KDE', '--key',
            'AnimationDurationFactor', factors[level]]


def save_preferences(prefs: dict, home: str | Path | None = None) -> Path:
    allowed = {'mode': MODES, 'density': DENSITIES}
    clean = {}
    for key, value in prefs.items():
        if key in allowed and value in allowed[key]:
            clean[key] = value
        elif key == 'accent':
            clean[key] = validate_accent(value)
    path = (Path(home) if home else Path.home()) / '.config/nova/desktop.json'
    path.parent.mkdir(parents=True, exist_ok=True)
    old = load_preferences(home)
    old.update(clean)
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(old, ensure_ascii=False, indent=1), encoding='utf-8')
    tmp.replace(path)
    return path


def load_preferences(home: str | Path | None = None) -> dict:
    path = (Path(home) if home else Path.home()) / '.config/nova/desktop.json'
    try:
        data = json.loads(path.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return {}
    if not isinstance(data, dict):
        return {}
    result = {}
    if data.get('mode') in MODES:
        result['mode'] = data['mode']
    if data.get('density') in DENSITIES:
        result['density'] = data['density']
    if isinstance(data.get('accent'), str) and HEX.match(data['accent']):
        result['accent'] = data['accent'].lower()
    return result
