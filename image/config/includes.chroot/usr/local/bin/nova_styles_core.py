#!/usr/bin/env python3
"""NOVA styles, desktop features and the day/night autopilot — pure logic.

A style = colours (Plasma colour scheme + nova_ui variant) + shape language
(nova_ui radii) + panel layout + wallpaper (static or NOVA Live). Everything
is applied at user level through Plasma's own tools; before the first style
change the Plasma layout is backed up, and «Вернуть как было» restores it.
"""
from __future__ import annotations

import json
import os
import re
import secrets
from pathlib import Path

import nova_layout_core as layout

LIVE_PLUGIN = 'org.nova.live.wallpaper'
SHARE = Path(__file__).resolve().parents[2] / 'share'      # /usr/share (or the repository overlay)

# id: (title, note, colour scheme, nova_ui variant, look-and-feel key, panel mode, wallpaper, icons, palette)
# wallpaper: ('image', package dir) or ('live', scene)
STYLES = {
    'air-light': {
        'title': 'NOVA Air — светлая', 'note': 'Спокойная, светлая, для работы', 'scheme': 'NovaAirLight',
        'variant': 'light', 'lnf': 'light', 'mode': 'windows', 'wallpaper': ('image', 'NOVA'), 'icons': 'breeze',
        'palette': ('#f4f6fa', '#1f6feb', '#162033'), 'layout_title': 'Панель снизу'},
    'air-dark': {
        'title': 'NOVA Air — тёмная', 'note': 'Та же NOVA Air для вечера', 'scheme': 'NovaAirDark',
        'variant': 'dark', 'lnf': 'dark', 'mode': 'windows', 'wallpaper': ('image', 'NOVA'), 'icons': 'breeze-dark',
        'palette': ('#11161f', '#4c93ff', '#e8eef7'), 'layout_title': 'Панель снизу'},
    'neon': {
        'title': 'NEON//SYS', 'note': 'Киберпанк: HUD, док, режимы', 'scheme': 'NovaNeon',
        'variant': 'neon', 'lnf': 'neon', 'mode': 'neon', 'wallpaper': ('neon', 'auto'), 'icons': 'Papirus-Dark',
        'palette': ('#0b0714', '#00e5f2', '#ff2a6d'), 'layout_title': 'HUD-панель и док'},
    'aurora': {
        'title': 'Aurora', 'note': 'Северное сияние, мятные тона', 'scheme': 'NovaAurora',
        'variant': 'aurora', 'lnf': 'aurora', 'mode': 'hybrid', 'wallpaper': ('live', 'aurora'), 'icons': 'Papirus-Dark',
        'palette': ('#071417', '#3ee6b0', '#8af5d2'), 'layout_title': 'Плавающая панель'},
    'sakura': {
        'title': 'Sakura', 'note': 'Светлая и мягкая, как macOS', 'scheme': 'NovaSakura',
        'variant': 'sakura', 'lnf': 'sakura', 'mode': 'dock', 'wallpaper': ('live', 'sakura'), 'icons': 'Papirus',
        'palette': ('#fbf6f7', '#c2185b', '#fadbe7'), 'layout_title': 'Строка сверху и док'},
    'ocean': {
        'title': 'Ocean', 'note': 'Строгий синий, как Windows 11', 'scheme': 'NovaOcean',
        'variant': 'ocean', 'lnf': 'ocean', 'mode': 'windows', 'wallpaper': ('live', 'ocean'), 'icons': 'Papirus-Dark',
        'palette': ('#06101f', '#38bdf8', '#7dd3fc'), 'layout_title': 'Панель снизу'},
    'horizon': {
        'title': 'Horizon', 'note': 'Светлая днём, тёмная ночью, живое небо', 'scheme': 'NovaAirLight',
        'variant': 'auto', 'lnf': 'light', 'mode': 'windows', 'wallpaper': ('live', 'sky'), 'icons': 'breeze',
        'palette': ('#f4f6fa', '#71b4ff', '#11161f'), 'layout_title': 'Панель снизу'},
}
STYLE_ORDER = tuple(STYLES)
NEW_LNF = ('aurora', 'sakura', 'ocean')          # look-and-feel packages added by NOVA styles

# Thumbnails for the style catalogue (static wallpaper packages)
THUMBS = {'air-light': 'NOVA', 'air-dark': 'NOVA', 'neon': 'NOVA-NEON', 'aurora': 'NOVA-Aurora',
          'sakura': 'NOVA-Sakura', 'ocean': 'NOVA-Ocean', 'horizon': 'NOVA-Horizon'}

# Desktop features (KWin built-ins; cube from kwin-addons). (title, description, writes when ON)
FEATURES = {
    'shake': ('Найти курсор встряхиванием мыши', 'Быстро поводите мышью — указатель увеличится (как в macOS).',
              [('kwinrc', 'Plugins', 'shakecursorEnabled', 'true')]),
    'corners': ('Активные углы', 'Верхний левый угол — обзор окон, нижний правый — рабочий стол (как в Windows 11).',
                [('kwinrc', 'Effect-overview', 'BorderActivate', '7'),
                 ('kwinrc', 'ElectricBorders', 'BottomRight', 'ShowDesktop')]),
    'magiclamp': ('Эффект волшебной лампы', 'Окна сворачиваются в панель плавной «воронкой».',
                  [('kwinrc', 'Plugins', 'magiclampEnabled', 'true'), ('kwinrc', 'Plugins', 'squashEnabled', 'false')]),
    'dim': ('Затемнение неактивных окон', 'Окно, в котором вы работаете, выделяется само.',
            [('kwinrc', 'Plugins', 'diminactiveEnabled', 'true')]),
    'cube': ('Куб рабочих столов', 'Рабочие столы на гранях куба: Win+C.',
             [('kwinrc', 'Plugins', 'cubeEnabled', 'true')]),
    'wobbly': ('Желейные окна', 'Окна мягко покачиваются при перетаскивании.',
               [('kwinrc', 'Plugins', 'wobblywindowsEnabled', 'true')]),
    'blur': ('Размытие под панелями', 'Полупрозрачные панели и меню с размытием фона.',
             [('kwinrc', 'Plugins', 'blurEnabled', 'true')]),
    'chameleon': ('Хамелеон: цвет акцента из обоев', 'Кнопки и выделение подстраиваются под цвет ваших обоев.',
                  [('kdeglobals', 'General', 'accentColorFromWallpaper', 'true')]),
    'warmlight': ('Тёплый свет вечером', 'Экран теплеет после заката по вашему месту — глазам легче (без интернета).',
                  [('kwinrc', 'NightColor', 'Active', 'true'), ('kwinrc', 'NightColor', 'Mode', 'Location'),
                   ('kwinrc', 'NightColor', 'LatitudeFixed', '%LAT%'),
                   ('kwinrc', 'NightColor', 'LongitudeFixed', '%LON%')]),
    'translucency': ('Прозрачность при перемещении', 'Окно становится полупрозрачным, пока вы его двигаете.',
                     [('kwinrc', 'Plugins', 'translucencyEnabled', 'true')]),
    'fastanim': ('Быстрые анимации', 'Все анимации вдвое короче — система ощущается быстрее.',
                 [('kdeglobals', 'KDE', 'AnimationDurationFactor', '0.5')]),
    'reducemotion': ('Уменьшить движение', 'Без анимаций — для чувствительных к движению и слабых компьютеров.',
                     [('kdeglobals', 'KDE', 'AnimationDurationFactor', '0')]),
    'eco': ('Экономия энергии', 'Без размытия и «желе», короче анимации — дольше от батареи.',
            [('kwinrc', 'Plugins', 'blurEnabled', 'false'), ('kwinrc', 'Plugins', 'wobblywindowsEnabled', 'false'),
             ('kwinrc', 'Plugins', 'translucencyEnabled', 'false'),
             ('kdeglobals', 'KDE', 'AnimationDurationFactor', '0.5')]),
}
FEATURE_ORDER = tuple(FEATURES)
BUILTIN_FEATURES = (('Snap-раскладки окон', 'Win+T — выберите, как разложить окна по экрану.'),
                    ('Обзор окон', 'Win+Tab — все окна и рабочие столы.'))

_HEX = re.compile(r'^#[0-9a-fA-F]{6}$')


def validate_style(style: str) -> str:
    if style not in STYLES:
        raise ValueError(f'Неизвестный стиль: {style!r}. Допустимо: {", ".join(STYLE_ORDER)}')
    return style


def validate_feature(feature: str) -> str:
    if feature not in FEATURES:
        raise ValueError(f'Неизвестная функция: {feature!r}. Допустимо: {", ".join(FEATURE_ORDER)}')
    return feature


def thumbnail(style: str) -> Path:
    base = SHARE / 'wallpapers' / THUMBS[validate_style(style)] / 'contents'
    for name in ('screenshot.png', 'screenshot.jpg'):
        if (base / name).is_file():
            return base / name
    return base / 'images/1920x1080.png'

# ---------------------------------------------------------------- state

STATE_KEYS = {'style': str, 'backup': str, 'prev_lnf': str, 'prev_choice': str, 'autopilot': bool,
              'feature_backup': dict, 'autopilot_mode': str, 'schedule_light': str, 'schedule_dark': str}
_HHMM = re.compile(r'^([01]\d|2[0-3]):[0-5]\d$')


def state_path(home=None) -> Path:
    return (Path(home) if home else Path.home()) / '.config/nova/style.json'


def load_state(home=None) -> dict:
    try:
        data = json.loads(state_path(home).read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return {}
    if not isinstance(data, dict):
        return {}
    clean = {k: v for k, v in data.items() if k in STATE_KEYS and isinstance(v, STATE_KEYS[k])}
    if clean.get('style') not in STYLES:
        clean.pop('style', None)
    if clean.get('prev_lnf') not in (None, 'light', 'dark', 'kde-default'):
        clean.pop('prev_lnf', None)
    if clean.get('autopilot_mode') not in (None, 'sun', 'schedule'):
        clean.pop('autopilot_mode', None)
    for k in ('schedule_light', 'schedule_dark'):
        if k in clean and not _HHMM.match(clean[k]):
            clean.pop(k)
    fb = clean.get('feature_backup')
    if fb is not None:
        clean['feature_backup'] = {k: v for k, v in fb.items()
                                   if isinstance(k, str) and re.fullmatch(r'[\w.\-]+/[\w.\-]+/[\w.\-]+', k)
                                   and (v is None or (isinstance(v, str) and len(v) < 80))}
    return clean


def save_state(update: dict, home=None) -> Path:
    path = state_path(home)
    path.parent.mkdir(parents=True, exist_ok=True)
    data = load_state(home)
    for k, v in update.items():
        if v is None:
            data.pop(k, None)
        elif k in STATE_KEYS and isinstance(v, STATE_KEYS[k]):
            data[k] = v
    tmp = path.parent / f'.style-{secrets.token_hex(6)}.tmp'
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding='utf-8')
    os.replace(tmp, path)
    return path

# ---------------------------------------------------------------- reading KDE config


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


# Values in effect when the user's kwinrc has no entry (NOVA /etc/xdg defaults and KDE defaults)
FEATURE_DEFAULTS = {('kwinrc', 'Plugins', 'blurEnabled'): 'true', ('kwinrc', 'Plugins', 'squashEnabled'): 'true'}


def feature_enabled(feature: str, home=None) -> bool:
    for file, group, key, value in FEATURES[validate_feature(feature)][2]:
        current = kde_value(home, file, group, key)
        if current is None:
            current = FEATURE_DEFAULTS.get((file, group, key))
        if value.startswith('%'):          # location placeholder: any value counts
            if current is None:
                return False
            continue
        if current != value:
            return False
    return True

# ---------------------------------------------------------------- command builders


def kwrite(file: str, group: str, key: str, value: str | None) -> list[str]:
    argv = ['kwriteconfig6', *(['--notify'] if file == 'kdeglobals' else []), '--file', file]
    for g in group.split('/'):
        argv += ['--group', g]
    argv += ['--key', key]
    argv += ['--delete'] if value is None else [value]
    return argv


def feature_commands(feature: str, on: bool, backup: dict | None = None,
                     lat: float = 55.7558, lon: float = 37.6176) -> list[list[str]]:
    """ON writes the feature values; OFF restores what the user had (from `backup`) or KDE defaults."""
    cmds = []
    for file, group, key, value in FEATURES[validate_feature(feature)][2]:
        value = value.replace('%LAT%', f'{lat:.4f}').replace('%LON%', f'{lon:.4f}')
        if on:
            cmds.append(kwrite(file, group, key, value))
        else:
            previous = (backup or {}).get(f'{file}/{group}/{key}')
            cmds.append(kwrite(file, group, key, previous))
    return cmds


def wallpaper_js(style: str, lat: float, lon: float) -> str:
    kind, value = STYLES[validate_style(style)]['wallpaper']
    if kind == 'image':
        url = json.dumps(f'file:///usr/share/wallpapers/{value}/')
        return ('var ws = desktops();\nfor (var i = 0; i < ws.length; i++) { var d = ws[i]; novaTry(function () {\n'
                '  d.wallpaperPlugin = "org.kde.image";\n  d.currentConfigGroup = ["Wallpaper", "org.kde.image", "General"];\n'
                f'  d.writeConfig("Image", {url}); }}); }}\n')
    if kind == 'live':
        return ('var ws = desktops();\nfor (var i = 0; i < ws.length; i++) { var d = ws[i]; novaTry(function () {\n'
                f'  d.wallpaperPlugin = "{LIVE_PLUGIN}";\n'
                f'  d.currentConfigGroup = ["Wallpaper", "{LIVE_PLUGIN}", "General"];\n'
                f'  d.writeConfig("Scene", {json.dumps(value)});\n'
                f'  d.writeConfig("Latitude", {float(lat):.4f});\n  d.writeConfig("Longitude", {float(lon):.4f});\n'
                '  d.writeConfig("Paused", false); });\n  novaTry(function () { d.reloadConfig(); }); }\n')
    raise ValueError('NEON uses nova-neon')


def plasma_script(style: str, lat: float, lon: float, density: str = 'standard', *,
                  remove_existing: bool = True, keep_layout: bool = False) -> str:
    st = STYLES[validate_style(style)]
    if st['mode'] == 'neon':
        raise ValueError('NEON uses nova-neon')
    if keep_layout:
        js = layout._JS_HELPERS.replace('%WALLPAPER%', layout.WALLPAPER).strip() + '\n'
    else:
        js = layout.plasma_script(st['mode'], density, remove_existing=remove_existing, set_wallpaper=False)
    return js + f'// NOVA style: {style}\n' + wallpaper_js(style, lat, lon)


def lnf_layout_script(style: str, lat: float = 55.75, lon: float = 37.62) -> str:
    return plasma_script(style, lat, lon, remove_existing=False)

# ---------------------------------------------------------------- generated assets


def lnf_metadata(style: str, version: str) -> str:
    st = STYLES[validate_style(style)]
    pid = layout.LNF[st['lnf']]
    data = {
        'KPackageStructure': 'Plasma/LookAndFeel',
        'KPlugin': {
            'Authors': [{'Name': 'NOVA OS community project'}], 'Category': '',
            'Description': f'NOVA style {st["title"]}', 'Description[ru]': f'Стиль NOVA: {st["note"]}',
            'Id': pid, 'License': 'GPL-2.0-or-later', 'Name': f'NOVA {st["title"]}',
            'Name[ru]': f'NOVA {st["title"]}', 'Version': version, 'Website': '',
        },
        'X-Plasma-APIVersion': '2',
    }
    return json.dumps(data, ensure_ascii=False, indent=4) + '\n'


def lnf_defaults(style: str) -> str:
    st = STYLES[validate_style(style)]
    return f"""[kdeglobals][KDE]
widgetStyle=Breeze

[kdeglobals][General]
ColorScheme={st['scheme']}

[kdeglobals][Icons]
Theme={st['icons']}

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
Theme=org.kde.breeze.desktop
"""


def live_metadata(version: str) -> str:
    data = {
        'KPackageStructure': 'Plasma/Wallpaper',
        'KPlugin': {
            'Authors': [{'Name': 'NOVA OS community project'}],
            'Description': 'Living wallpapers: real sky, aurora, sakura, moonlit ocean (QML, no extra software)',
            'Description[ru]': 'Живые обои: настоящее небо, северное сияние, сакура, лунный океан',
            'Icon': 'preferences-desktop-wallpaper', 'Id': LIVE_PLUGIN, 'License': 'GPL-2.0-or-later',
            'Name': 'NOVA Live', 'Name[ru]': 'NOVA Live — живые обои', 'Version': version,
        },
        'X-Plasma-API-Minimum-Version': '6.0',
    }
    return json.dumps(data, ensure_ascii=False, indent=4) + '\n'


def live_kcfg() -> str:
    return """<?xml version="1.0" encoding="UTF-8"?>
<!-- NOVA Live wallpaper settings — generated by tools/gen-plasma-theme.py -->
<kcfg xmlns="http://www.kde.org/standards/kcfg/1.0"
      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xsi:schemaLocation="http://www.kde.org/standards/kcfg/1.0 http://www.kde.org/standards/kcfg/1.0/kcfg.xsd">
  <kcfgfile name=""/>
  <group name="General">
    <entry name="Scene" type="String">
      <label>Scene: sky, aurora, sakura, ocean</label>
      <default>sky</default>
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
      <label>Freeze the animation</label>
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
    <entry name="Latitude" type="Double">
      <label>Latitude for the living sky</label>
      <default>55.75</default>
    </entry>
    <entry name="Longitude" type="Double">
      <label>Longitude for the living sky</label>
      <default>37.62</default>
    </entry>
  </group>
</kcfg>
"""


def wallpaper_metadata(package: str, name: str) -> str:
    return json.dumps({'KPlugin': {'Authors': [{'Name': 'NOVA OS community project'}], 'Id': package,
                                   'License': 'NOVA OS project artwork', 'Name': name}}, indent=4) + '\n'

# ---------------------------------------------------------------- autopilot


def autopilot_scheme(is_day: bool) -> str:
    return 'NovaAirLight' if is_day else 'NovaAirDark'


def autopilot_decision(current_scheme: str | None, is_day: bool) -> str | None:
    """Colour scheme to switch to, or None when nothing has to change."""
    want = autopilot_scheme(is_day)
    return None if current_scheme == want else want


def parse_hhmm(text: str) -> str:
    text = (text or '').strip()
    if re.fullmatch(r'\d:[0-5]\d', text):
        text = '0' + text
    if not _HHMM.match(text):
        raise ValueError(f'Время в виде ЧЧ:ММ, например 07:30 (получено {text!r})')
    return text


def schedule_is_day(now_local, light: str, dark: str) -> bool:
    """Fixed schedule: light theme from `light` until `dark` (both HH:MM, may wrap past midnight)."""
    m = now_local.hour * 60 + now_local.minute
    a = int(light[:2]) * 60 + int(light[3:])
    b = int(dark[:2]) * 60 + int(dark[3:])
    if a == b:
        return True
    return a <= m < b if a < b else (m >= a or m < b)


def revert_summary(state: dict) -> list[str]:
    """What «Вернуть как было» will bring back — shown before the user confirms."""
    items = []
    if state.get('style'):
        items.append(f'оформление до стиля «{STYLES[state["style"]]["title"]}» (тема, цвета, значки)')
    items.append('панели и виджеты из резервной копии' if state.get('backup') else 'обои NOVA (панели не менялись)')
    names = sorted({FEATURES[f][0] for f in FEATURE_ORDER for (fl, g, k, _v) in FEATURES[f][2]
                    if f'{fl}/{g}/{k}' in (state.get('feature_backup') or {})})
    if names:
        items.append('ваши прежние настройки эффектов: ' + ', '.join(n.lower() for n in names))
    if state.get('autopilot'):
        items.append('автопилот день/ночь будет выключен')
    return items
