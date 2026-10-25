#!/usr/bin/env python3
"""NEON//SYS for NOVA OS — pure logic, no side effects on import.

NEON//SYS is a built-in cyberpunk look for KDE Plasma 6 made only from what
NOVA already ships: a look-and-feel package, a colour scheme, a QML wallpaper
plugin (no Wallpaper Engine / Lively), stock Plasma widgets, a Konsole
profile, a freedesktop sound theme and the NOVA Qt apps. Nothing is
downloaded and nothing outside the user's home is changed.

Every change is reversible: before NEON touches the panels the Plasma layout
is backed up with nova_layout_core.make_backup(), and the previous state of
everything else (look-and-feel, sounds, Konsole profile, power profile,
do-not-disturb, night light) is recorded in ~/.config/nova/neon.json.
"""
from __future__ import annotations

import json
import os
import re
import secrets
from datetime import datetime
from pathlib import Path

import nova_layout_core as layout

LNF = layout.LNF['neon']                      # org.nova.neon.desktop
COLOR_SCHEME = 'NovaNeon'
WALLPAPER_PLUGIN = 'org.nova.neon.wallpaper'
STATIC_WALLPAPER = 'file:///usr/share/wallpapers/NOVA-NEON/'
SOUND_THEME = 'nova-neon'
KONSOLE_PROFILE = 'NEON.profile'
ICON_THEME = 'Papirus-Dark'

# Live wallpaper scenes (QML, see /usr/share/plasma/wallpapers/org.nova.neon.wallpaper)
SCENES = {
    'auto': 'По времени суток (день — синтвейв, вечер — город, ночь — цифровой дождь)',
    'synth': 'Synth Grid — неоновое солнце и бесконечная сетка',
    'city': 'Night City — ночной город под дождём',
    'rain': 'Data Rain — цифровой дождь',
    'circuit': 'Circuit — светящаяся плата и импульсы',
}
SCENE_ORDER = tuple(SCENES)

# Modes: what each one changes. Everything is restored by `work`.
MODES = {
    'work': {'title': 'WORK — обычная работа', 'scene': 'auto', 'power': None, 'dnd': False, 'night': None,
             'paused': False},
    'game': {'title': 'GAME — игры: производительность, без уведомлений, обои на паузе', 'scene': None,
             'power': 'performance', 'dnd': True, 'night': None, 'paused': True},
    'night': {'title': 'NIGHT — вечер: ночной город, тёплый экран', 'scene': 'city', 'power': None,
              'dnd': False, 'night': True, 'paused': False},
    'focus': {'title': 'FOCUS — фокус: цифровой дождь, без уведомлений', 'scene': 'rain', 'power': None,
              'dnd': True, 'night': None, 'paused': False},
}
MODE_ORDER = ('work', 'game', 'night', 'focus')

# Global shortcuts. Chosen so they do not collide with KDE defaults or the
# Windows-like NOVA table (nova_hotkeys_core); checked in tests.
SHORTCUTS = (
    ('nova-neon-center.desktop', 'Meta+Alt+N', 'Win+Alt+N — центр NEON//SYS'),
    ('nova-neon-work.desktop', 'Ctrl+Meta+Alt+1', 'Ctrl+Win+Alt+1 — режим WORK'),
    ('nova-neon-game.desktop', 'Ctrl+Meta+Alt+2', 'Ctrl+Win+Alt+2 — режим GAME'),
    ('nova-neon-night.desktop', 'Ctrl+Meta+Alt+3', 'Ctrl+Win+Alt+3 — режим NIGHT'),
    ('nova-neon-focus.desktop', 'Ctrl+Meta+Alt+4', 'Ctrl+Win+Alt+4 — режим FOCUS'),
    ('nova-neon-wallpaper.desktop', 'Meta+Alt+W', 'Win+Alt+W — следующие живые обои'),
)

LAUNCHERS = layout.LAUNCHERS + ('applications:nova-neon-center.desktop',)

# Desktop widgets: (plugin, column, height in px at 100 %). Stock Plasma 6
# applets only (plasma-workspace / plasma-widgets-addons). Missing ones are
# skipped by the script (knownWidgetTypes), never shown as broken.
WIDGETS = (
    ('org.kde.plasma.digitalclock', 'left', 150),
    ('org.kde.plasma.systemmonitor.cpu', 'left', 170),
    ('org.kde.plasma.systemmonitor.memory', 'left', 170),
    ('org.kde.plasma.systemmonitor.net', 'left', 170),
    ('org.kde.plasma.calendar', 'right', 230),
    ('org.kde.plasma.mediacontroller', 'right', 170),
    ('org.kde.plasma.notes', 'right', 190),
    ('org.kde.plasma.timer', 'right', 150),
)
WIDGET_WIDTH = 300
WIDGET_GAP = 14

_NAME = re.compile(r'^[a-z0-9.\-]{1,64}$')


def validate_scene(scene: str) -> str:
    if scene not in SCENES:
        raise ValueError(f'Неизвестные обои: {scene!r}. Допустимо: {", ".join(SCENES)}')
    return scene


def validate_mode(mode: str) -> str:
    if mode not in MODES:
        raise ValueError(f'Неизвестный режим: {mode!r}. Допустимо: {", ".join(MODE_ORDER)}')
    return mode


def next_scene(current: str) -> str:
    order = SCENE_ORDER
    return order[(order.index(current) + 1) % len(order)] if current in order else order[0]

# ---------------------------------------------------------------------------
# State (~/.config/nova/neon.json)
# ---------------------------------------------------------------------------

STATE_KEYS = {
    'active': bool, 'scene': str, 'mode': str, 'backup': str, 'prev_lnf': str, 'prev_choice': str,
    'prev_sound_theme': str, 'prev_sound_enable': str, 'prev_konsole_profile': str, 'prev_icon_theme': str,
    'prev_power': str, 'prev_dnd': str, 'prev_night': str, 'layout_applied': bool,
}


def state_path(home=None) -> Path:
    return (Path(home) if home else Path.home()) / '.config/nova/neon.json'


def load_state(home=None) -> dict:
    try:
        data = json.loads(state_path(home).read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return {}
    if not isinstance(data, dict):
        return {}
    clean = {k: v for k, v in data.items() if k in STATE_KEYS and isinstance(v, STATE_KEYS[k])}
    for key in ('scene',):
        if clean.get(key) not in SCENES:
            clean.pop(key, None)
    if clean.get('mode') not in MODES:
        clean.pop('mode', None)
    for key in ('prev_lnf', 'prev_sound_theme', 'prev_sound_enable', 'prev_konsole_profile', 'prev_icon_theme',
                'prev_power', 'prev_night'):
        if key in clean and not re.fullmatch(r'[A-Za-z0-9._\-]{0,80}', clean[key]):
            clean.pop(key)
    return clean


def save_state(state: dict, home=None) -> Path:
    path = state_path(home)
    path.parent.mkdir(parents=True, exist_ok=True)
    old = load_state(home)
    old.update({k: v for k, v in state.items() if k in STATE_KEYS and isinstance(v, STATE_KEYS[k])})
    for k, v in state.items():          # explicit None removes a key
        if v is None:
            old.pop(k, None)
    tmp = path.parent / f'.neon-{secrets.token_hex(6)}.tmp'
    tmp.write_text(json.dumps(old, ensure_ascii=False, indent=1), encoding='utf-8')
    os.replace(tmp, path)
    return path

# ---------------------------------------------------------------------------
# Reading the user's current KDE settings (to restore them later)
# ---------------------------------------------------------------------------

def kde_value(home, filename: str, group: str, key: str) -> str | None:
    path = (Path(home) if home else Path.home()) / '.config' / filename
    try:
        text = path.read_text(encoding='utf-8', errors='replace')
    except OSError:
        return None
    current = None
    for raw in text.splitlines():
        line = raw.strip()
        if line.startswith('[') and line.endswith(']'):
            current = line[1:-1]
            continue
        if current == group and '=' in line:
            k, v = line.split('=', 1)
            if k.strip() == key:
                return v.strip()
    return None


def current_lnf_variant(home=None) -> str:
    """'light', 'dark', 'neon' or 'kde-default' — what to return to after NEON."""
    package = kde_value(home, 'kdeglobals', 'KDE', 'LookAndFeelPackage') or layout.LNF['light']
    for variant, pid in layout.LNF.items():
        if pid == package:
            return variant
    return 'kde-default' if package == layout.KDE_DEFAULT_LNF else 'light'


def is_active(home=None) -> bool:
    return bool(load_state(home).get('active'))

# ---------------------------------------------------------------------------
# Command builders (fixed argv; executed by nova-neon)
# ---------------------------------------------------------------------------

def kwrite(file: str, group: str, key: str, value: str | None, notify: bool = False) -> list[str]:
    groups = []
    for g in group.split('/'):
        groups += ['--group', g]
    argv = ['kwriteconfig6', '--file', file, *groups, '--key', key]
    if notify:
        argv.insert(1, '--notify')
    if value is None:
        argv.append('--delete')
    else:
        argv.append(value)
    return argv


def look_commands() -> list[list[str]]:
    """NEON look without touching panels."""
    return [
        layout.lookandfeel_command('neon'),
        kwrite('kdeglobals', 'Sounds', 'Theme', SOUND_THEME),
        kwrite('kdeglobals', 'Sounds', 'Enable', 'true'),
        kwrite('konsolerc', 'Desktop Entry', 'DefaultProfile', KONSOLE_PROFILE),
        kwrite('kscreenlockerrc', 'Greeter/Wallpaper/org.kde.image/General', 'Image', STATIC_WALLPAPER),
    ]


def restore_look_commands(state: dict) -> list[list[str]]:
    variant = state.get('prev_lnf', 'light')
    if variant == 'neon' or variant not in (*layout.LNF, 'kde-default'):
        variant = 'light'
    return [
        layout.lookandfeel_command(variant),
        kwrite('kdeglobals', 'Sounds', 'Theme', state.get('prev_sound_theme') or None),
        kwrite('kdeglobals', 'Sounds', 'Enable', state.get('prev_sound_enable') or None),
        kwrite('konsolerc', 'Desktop Entry', 'DefaultProfile', state.get('prev_konsole_profile') or None),
        kwrite('kscreenlockerrc', 'Greeter/Wallpaper/org.kde.image/General', 'Image', None),
    ]


def dnd_commands(on: bool, previous: str | None = None) -> list[list[str]]:
    """Plasma «Не беспокоить» through plasmanotifyrc (watched live by Plasma)."""
    if on:
        return [kwrite('plasmanotifyrc', 'DoNotDisturb', 'Until', '2099,1,1,0,0,0', notify=True)]
    return [kwrite('plasmanotifyrc', 'DoNotDisturb', 'Until', previous or None, notify=True)]


def night_light_commands(on: bool | None, previous: str | None = None) -> list[list[str]]:
    value = 'true' if on else (previous or None)
    return [kwrite('kwinrc', 'NightColor', 'Active', value)]


def power_command(profile: str) -> list[str]:
    if profile not in ('performance', 'balanced', 'power-saver'):
        raise ValueError('профиль питания: performance, balanced или power-saver')
    return ['powerprofilesctl', 'set', profile]

# ---------------------------------------------------------------------------
# Plasma desktop scripts (ES5, generated from constants only)
# ---------------------------------------------------------------------------

_NEON_JS = r'''
function neonKnown(plugin) {
  var known = [];
  novaTry(function () { known = knownWidgetTypes(); });
  if (!known || known.length === undefined || known.length === 0) { return true; }
  for (var i = 0; i < known.length; i++) { if (known[i] === plugin) { return true; } }
  return false;
}
function neonWallpaper(scene, paused) {
  var all = desktops();
  for (var i = 0; i < all.length; i++) {
    var d = all[i];
    novaTry(function () {
      d.wallpaperPlugin = "%PLUGIN%";
      d.currentConfigGroup = ["Wallpaper", "%PLUGIN%", "General"];
      if (scene !== null) { d.writeConfig("Scene", scene); }
      if (paused !== null) { d.writeConfig("Paused", paused); }
    });
    novaTry(function () { d.reloadConfig(); });
  }
}
function neonRemoveWidgets(d) {
  var ws = [];
  novaTry(function () { ws = d.widgets(); });
  for (var i = 0; i < ws.length; i++) {
    var w = ws[i];
    novaTry(function () {
      w.currentConfigGroup = ["NovaNeon"];
      if (String(w.readConfig("managed", "false")) === "true") { w.remove(); }
    });
  }
}
function neonAddWidget(d, plugin, x, y, wd, ht) {
  if (!neonKnown(plugin)) { return null; }
  var w = null;
  novaTry(function () { w = d.addWidget(plugin, x, y, wd, ht); });
  if (w) { novaTry(function () { w.currentConfigGroup = ["NovaNeon"]; w.writeConfig("managed", "true"); }); }
  return w;
}
function neonWidgets(list, width, gap, top, bottom) {
  var all = desktops();
  for (var i = 0; i < all.length; i++) {
    var d = all[i];
    neonRemoveWidgets(d);
    var g = { x: 0, y: 0, width: 1920, height: 1080 };
    novaTry(function () { var s = screenGeometry(d.screen); if (s && s.width > 0) { g = s; } });
    if (g.width < 2 * width + 3 * gap + 200) { continue; }        // too narrow: keep the desktop clean
    var y = { left: top, right: top };
    for (var j = 0; j < list.length; j++) {
      var item = list[j];
      if (y[item[1]] + item[2] > g.height - bottom) { continue; }   // does not fit on this screen
      var x = item[1] === "left" ? gap : g.width - width - gap;
      neonAddWidget(d, item[0], x, y[item[1]], width, item[2]);
      y[item[1]] += item[2] + gap;
    }
  }
}
'''


def _helpers() -> str:
    return (layout._JS_HELPERS.replace('%WALLPAPER%', STATIC_WALLPAPER).strip() + '\n'
            + _NEON_JS.replace('%PLUGIN%', WALLPAPER_PLUGIN).strip())


def _js_scene(scene) -> str:
    return 'null' if scene is None else json.dumps(validate_scene(scene))


def wallpaper_script(scene: str | None = None, paused: bool | None = None) -> str:
    """Switch every desktop to the NEON wallpaper plugin (optionally set scene / pause)."""
    js_paused = 'null' if paused is None else ('true' if paused else 'false')
    return _helpers() + f'\nneonWallpaper({_js_scene(scene)}, {js_paused});\n'


def widgets_script(density: str = 'standard') -> str:
    layout.validate_density(density)
    top = layout.TOPBAR_HEIGHT[density] + 24
    bottom = layout.PANEL_HEIGHT[density] + 40
    items = '[' + ', '.join(f'[{json.dumps(p)}, {json.dumps(c)}, {int(h)}]' for p, c, h in WIDGETS) + ']'
    return _helpers() + f'\nneonWidgets({items}, {WIDGET_WIDTH}, {WIDGET_GAP}, {top}, {bottom});\n'


def plasma_script(density: str = 'standard', *, remove_existing: bool = True, widgets: bool = True,
                  scene: str = 'auto') -> str:
    """Full NEON desktop: thin HUD bar on top, floating dock, live wallpaper, widgets."""
    layout.validate_density(density)
    validate_scene(scene)
    h = layout.PANEL_HEIGHT[density]
    top = layout.TOPBAR_HEIGHT[density]
    launchers = '[' + ', '.join(json.dumps(i) for i in LAUNCHERS) + ']'
    js = [_helpers(), '', f'// NEON//SYS desktop, density: {density}']
    if remove_existing:
        js.append('novaRemovePanels();')
    js += [
        'var bar = new Panel;',
        'novaTry(function () { bar.location = "top"; });',
        f'novaTry(function () {{ bar.height = {top}; }});',
        'novaTry(function () { bar.floating = false; });',
        'novaTry(function () { bar.lengthMode = "fill"; });',
        'novaKickoff(bar);',
        'novaWidget(bar, "org.kde.plasma.pager");',
        'novaSpacer(bar);',
        'novaWidget(bar, "org.kde.plasma.digitalclock");',
        'novaSpacer(bar);',
        'novaWidget(bar, "org.kde.plasma.systemtray");',
        'var dock = new Panel;',
        'novaTry(function () { dock.location = "bottom"; });',
        f'novaTry(function () {{ dock.height = {h + 8}; }});',
        'novaTry(function () { dock.alignment = "center"; });',
        'novaTry(function () { dock.lengthMode = "fit"; });',
        'novaTry(function () { dock.floating = true; });',
        'novaTry(function () { dock.hiding = "dodgewindows"; });',
        f'novaTasks(dock, {launchers});',
        f'neonWallpaper({_js_scene(scene)}, false);',
    ]
    if widgets:
        top_px = top + 24
        bottom_px = h + 40
        items = '[' + ', '.join(f'[{json.dumps(p)}, {json.dumps(c)}, {int(hh)}]' for p, c, hh in WIDGETS) + ']'
        js.append(f'neonWidgets({items}, {WIDGET_WIDTH}, {WIDGET_GAP}, {top_px}, {bottom_px});')
    return '\n'.join(js) + '\n'


def lnf_layout_script() -> str:
    """contents/layouts/org.kde.plasma.desktop-layout.js of the NEON look-and-feel."""
    return plasma_script(remove_existing=False)

# ---------------------------------------------------------------------------
# Generated text assets (written by tools/gen-plasma-theme.py)
# ---------------------------------------------------------------------------

def _rgb(color: str) -> str:
    color = color.lstrip('#')
    return ','.join(str(int(color[i:i + 2], 16)) for i in (0, 2, 4))


def konsole_colorscheme(t: dict) -> str:
    """Konsole colour scheme from NEON tokens (16 ANSI colours + fg/bg)."""
    pal = [
        ('Background', t['bg']), ('BackgroundIntense', t['surface']), ('BackgroundFaint', t['bg']),
        ('Foreground', t['text']), ('ForegroundIntense', '#ffffff'), ('ForegroundFaint', t['text_muted']),
        ('Color0', '#1a1030'), ('Color0Intense', '#4a3a78'), ('Color0Faint', '#140d24'),
        ('Color1', t['neon_magenta']), ('Color1Intense', '#ff6b98'), ('Color1Faint', '#a3204a'),
        ('Color2', t['success']), ('Color2Intense', '#8affc8'), ('Color2Faint', '#1f8a5a'),
        ('Color3', t['neon_yellow']), ('Color3Intense', '#fff56b'), ('Color3Faint', '#a59a06'),
        ('Color4', '#4c7dff'), ('Color4Intense', '#8aa9ff'), ('Color4Faint', '#2c4aa0'),
        ('Color5', t['neon_violet']), ('Color5Intense', '#d6a6ff'), ('Color5Faint', '#6e3a9e'),
        ('Color6', t['neon_cyan']), ('Color6Intense', '#8cfaff'), ('Color6Faint', '#008e99'),
        ('Color7', '#d8d0f0'), ('Color7Intense', '#ffffff'), ('Color7Faint', '#8a80a8'),
    ]
    out = ['# NEON//SYS Konsole colours — generated by tools/gen-plasma-theme.py']
    for name, color in pal:
        out += [f'[{name}]', f'Color={_rgb(color)}', '']
    out += ['[General]', 'Blur=true', 'ColorRandomization=false', 'Description=NEON//SYS', 'Opacity=0.92',
            'Wallpaper=', '']
    return '\n'.join(out)


def konsole_profile() -> str:
    return ('[Appearance]\nColorScheme=NovaNeon\nFont=Share Tech Mono,12,-1,5,400,0,0,0,0,0,0,0,0,0,0,1\n'
            'BoldIntense=true\n\n'
            '[Cursor Options]\nCursorShape=1\nUseCustomCursorColor=true\nCustomCursorColor=252,238,10\n\n'
            '[General]\nName=NEON\nParent=FALLBACK/\nTerminalMargin=10\nTerminalCenter=false\n\n'
            '[Scrolling]\nScrollBarPosition=2\n\n'
            '[Terminal Features]\nBlinkingCursorEnabled=true\n')


SOUND_EVENTS = {
    # freedesktop sound name: NEON source file (/usr/share/sounds/nova-neon/stereo/<name>.oga)
    'dialog-information': 'notify', 'dialog-warning': 'exclamation', 'dialog-error': 'error',
    'dialog-question': 'asterisk', 'message-new-instant': 'message', 'message-new-email': 'mail',
    'device-added': 'connect', 'device-removed': 'disconnect', 'power-plug': 'connect',
    'power-unplug': 'disconnect', 'battery-low': 'battery_low', 'battery-caution': 'battery_critical',
    'desktop-login': 'logon', 'desktop-logout': 'shutdown', 'service-login': 'unlock',
    'complete': 'notify', 'bell': 'default', 'trash-empty': 'recycle', 'alarm-clock-elapsed': 'reminder',
}


def sound_index() -> str:
    return ('[Sound Theme]\nName=NEON//SYS\nComment=Оригинальные sci-fi звуки NEON//SYS\n'
            'Inherits=freedesktop\nDirectories=stereo\n\n[stereo]\nOutputProfile=stereo\n')


def lnf_metadata(version: str) -> str:
    data = {
        'KPackageStructure': 'Plasma/LookAndFeel',
        'KPlugin': {
            'Authors': [{'Name': 'NOVA OS community project'}],
            'Category': '',
            'Description': 'NEON//SYS: cyberpunk look with a HUD bar, floating dock, live wallpaper and widgets',
            'Description[ru]': 'NEON//SYS: киберпанк-оформление — HUD-панель, плавающий док, живые обои и виджеты',
            'Id': LNF,
            'License': 'GPL-2.0-or-later',
            'Name': 'NEON//SYS',
            'Name[ru]': 'NEON//SYS — киберпанк',
            'Version': version,
            'Website': '',
        },
        'X-Plasma-APIVersion': '2',
    }
    return json.dumps(data, ensure_ascii=False, indent=4) + '\n'


def lnf_defaults() -> str:
    return f"""[kdeglobals][KDE]
widgetStyle=Breeze

[kdeglobals][General]
ColorScheme={COLOR_SCHEME}

[kdeglobals][Icons]
Theme={ICON_THEME}

[plasmarc][Theme]
name=default

[kcminputrc][Mouse]
cursorTheme=breeze_cursors

[kwinrc][WindowSwitcher]
LayoutName=org.kde.breeze.desktop

[kwinrc][DesktopSwitcher]
LayoutName=org.kde.breeze.desktop

[kwinrc][org.kde.kdecoration2]
library=org.kde.breeze
theme=Breeze

[KSplash]
Theme={LNF}
"""


def wallpaper_metadata(version: str) -> str:
    data = {
        'KPackageStructure': 'Plasma/Wallpaper',
        'KPlugin': {
            'Authors': [{'Name': 'NOVA OS community project'}],
            'Description': 'Animated cyberpunk wallpaper written in QML (no extra software)',
            'Description[ru]': 'Живые киберпанк-обои на QML: синтвейв, ночной город, цифровой дождь, плата',
            'Icon': 'preferences-desktop-wallpaper',
            'Id': WALLPAPER_PLUGIN,
            'License': 'GPL-2.0-or-later',
            'Name': 'NEON//SYS Live',
            'Name[ru]': 'NEON//SYS — живые обои',
            'Version': version,
        },
        'X-Plasma-API-Minimum-Version': '6.0',
    }
    return json.dumps(data, ensure_ascii=False, indent=4) + '\n'


def wallpaper_kcfg() -> str:

    return f"""<?xml version="1.0" encoding="UTF-8"?>
<!-- NEON//SYS live wallpaper settings — generated by tools/gen-plasma-theme.py -->
<kcfg xmlns="http://www.kde.org/standards/kcfg/1.0"
      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xsi:schemaLocation="http://www.kde.org/standards/kcfg/1.0 http://www.kde.org/standards/kcfg/1.0/kcfg.xsd">
  <kcfgfile name=""/>
  <group name="General">
    <entry name="Scene" type="String">
      <label>Scene: {', '.join(SCENES)}</label>
      <default>auto</default>
    </entry>
    <entry name="Fps" type="Int">
      <label>Frames per second</label>
      <default>30</default>
      <min>5</min>
      <max>60</max>
    </entry>
    <entry name="Speed" type="Double">
      <label>Animation speed</label>
      <default>1.0</default>
    </entry>
    <entry name="Paused" type="Bool">
      <label>Freeze the animation (GAME mode)</label>
      <default>false</default>
    </entry>
    <entry name="PauseOnBattery" type="Bool">
      <label>Freeze on battery power</label>
      <default>true</default>
    </entry>
    <entry name="ShowClock" type="Bool">
      <label>Clock on the wallpaper</label>
      <default>false</default>
    </entry>
  </group>
</kcfg>
"""


def scene_for_hour(hour: int) -> str:
    """Same rule as the QML 'auto' scene (tested on both sides)."""
    if 7 <= hour < 18:
        return 'synth'
    if 18 <= hour < 23:
        return 'city'
    return 'rain'


def now_hour() -> int:
    return datetime.now().hour
