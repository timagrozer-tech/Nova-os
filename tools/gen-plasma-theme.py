#!/usr/bin/env python3
"""Generate NOVA Air KDE Plasma assets from the shared design tokens.

Single source of truth: nova_ui.TOKENS (colours) and nova_layout_core
(panel layouts). Output goes into image/config/includes.chroot. Run after
changing tokens; tests/test_v12.py fails if the files are out of date.

  python3 tools/gen-plasma-theme.py          # write files
  python3 tools/gen-plasma-theme.py --check  # exit 1 if anything differs
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OVERLAY = ROOT / 'image/config/includes.chroot'
sys.path.insert(0, str(OVERLAY / 'usr/local/bin'))

import nova_hotkeys_core as hotkeys  # noqa: E402
import nova_layout_core as layout  # noqa: E402
import nova_neon_core as neon  # noqa: E402
import nova_styles_core as styles  # noqa: E402
from nova_ui import TOKENS, nova_version  # noqa: E402

VERSION = (ROOT / 'VERSION').read_text(encoding='utf-8').strip()
FONT = 'Inter,10,-1,5,400,0,0,0,0,0,0,0,0,0,0,1'
SMALL_FONT = 'Inter,8,-1,5,400,0,0,0,0,0,0,0,0,0,0,1'
MONO_FONT = 'Noto Sans Mono,10,-1,5,400,0,0,0,0,0,0,0,0,0,0,1'


def rgb(hex_color: str) -> str:
    h = hex_color.lstrip('#')
    return ','.join(str(int(h[i:i + 2], 16)) for i in (0, 2, 4))


def color_groups(variant: str) -> str:
    t = TOKENS[variant]
    other = TOKENS['dark']
    visited = '#7b3fd6' if variant == 'light' else '#b18cff'
    if variant == 'neon':
        visited = t['neon_violet']

    def group(name, bg, alt, fg, inactive):
        return '\n'.join([
            f'[Colors:{name}]',
            f'BackgroundAlternate={rgb(alt)}',
            f'BackgroundNormal={rgb(bg)}',
            f'DecorationFocus={rgb(t["accent"])}',
            f'DecorationHover={rgb(t["accent"])}',
            f'ForegroundActive={rgb(t["accent"])}',
            f'ForegroundInactive={rgb(inactive)}',
            f'ForegroundLink={rgb(t["accent"])}',
            f'ForegroundNegative={rgb(t["danger"])}',
            f'ForegroundNeutral={rgb(t["warning"])}',
            f'ForegroundNormal={rgb(fg)}',
            f'ForegroundPositive={rgb(t["success"])}',
            f'ForegroundVisited={rgb(visited)}',
            '',
        ])

    selection_inactive = {'light': '#e3edff', 'dark': '#203454', 'neon': '#2a1a4a', 'aurora': '#123a36',
                          'sakura': '#f3d6e2', 'ocean': '#132c4a'}[variant]
    parts = [
        group('Window', t['bg'], t['surface_alt'], t['text'], t['text_muted']),
        group('View', t['surface'], t['surface_alt'], t['text'], t['text_muted']),
        group('Button', t['surface'], t['surface_alt'], t['text'], t['text_muted']),
        group('Header', t['bg'], t['surface_alt'], t['text'], t['text_muted']),
        group('Header][Inactive', t['bg'], t['surface_alt'], t['text_muted'], t['text_muted']),
        group('Tooltip', t['surface'], t['surface_alt'], t['text'], t['text_muted']),
        group('Complementary', other['bg'], other['surface_alt'], other['text'], other['text_muted']),
        '\n'.join([
            '[Colors:Selection]',
            f'BackgroundAlternate={rgb(t["accent_hover"])}',
            f'BackgroundNormal={rgb(t["accent"])}',
            f'DecorationFocus={rgb(t["accent"])}',
            f'DecorationHover={rgb(t["accent"])}',
            f'ForegroundActive={rgb(t["accent_text"])}',
            f'ForegroundInactive={rgb(selection_inactive)}',
            f'ForegroundLink={rgb(t["accent_text"])}',
            f'ForegroundNegative={rgb(t["danger"])}',
            f'ForegroundNeutral={rgb(t["warning"])}',
            f'ForegroundNormal={rgb(t["accent_text"])}',
            f'ForegroundPositive={rgb(t["success"])}',
            f'ForegroundVisited={rgb(t["accent_text"])}',
            '',
        ]),
        '\n'.join([
            '[ColorEffects:Disabled]',
            'Color=56,56,56', 'ColorAmount=0', 'ColorEffect=0', 'ContrastAmount=0.65',
            'ContrastEffect=1', 'IntensityAmount=0.1', 'IntensityEffect=2', '',
            '[ColorEffects:Inactive]',
            'ChangeSelectionColor=true', 'Color=112,111,110', 'ColorAmount=0.025', 'ColorEffect=2',
            'ContrastAmount=0.1', 'ContrastEffect=2', 'Enable=false', 'IntensityAmount=0',
            'IntensityEffect=0', '',
            '[WM]',
            f'activeBackground={rgb(t["bg"])}',
            f'activeBlend={rgb(t["text"])}',
            f'activeForeground={rgb(t["text"])}',
            f'inactiveBackground={rgb(t["bg"])}',
            f'inactiveBlend={rgb(t["text_muted"])}',
            f'inactiveForeground={rgb(t["text_muted"])}',
            '',
        ]),
    ]
    return '\n'.join(parts)


SCHEMES = {'light': ('NovaAirLight', 'NOVA Air Light'), 'dark': ('NovaAirDark', 'NOVA Air Dark'),
           'neon': (neon.COLOR_SCHEME, 'NEON//SYS'), 'aurora': ('NovaAurora', 'NOVA Aurora'),
           'sakura': ('NovaSakura', 'NOVA Sakura'), 'ocean': ('NovaOcean', 'NOVA Ocean')}


def colors_file(variant: str) -> str:
    name, title = SCHEMES[variant]
    family = {'neon': 'NEON//SYS', 'aurora': 'NOVA Aurora', 'sakura': 'NOVA Sakura',
              'ocean': 'NOVA Ocean'}.get(variant, 'NOVA Air')
    return (f'# {family} colour scheme ({variant}) — generated by tools/gen-plasma-theme.py\n'
            + color_groups(variant)
            + f'\n[General]\nColorScheme={name}\nName={title}\nName[ru]={title}\nshadeSortColumn=true\n\n'
            '[KDE]\ncontrast=4\n')


def lnf_defaults(variant: str) -> str:
    scheme = 'NovaAirLight' if variant == 'light' else 'NovaAirDark'
    icons = 'breeze' if variant == 'light' else 'breeze-dark'
    plasma_theme = 'default' if variant == 'light' else 'breeze-dark'
    return f"""[kdeglobals][KDE]
widgetStyle=Breeze

[kdeglobals][General]
ColorScheme={scheme}

[kdeglobals][Icons]
Theme={icons}

[plasmarc][Theme]
name={plasma_theme}

[Wallpaper]
Image=NOVA

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


def lnf_metadata(variant: str) -> str:
    pid = layout.LNF[variant]
    name = 'NOVA Air Light' if variant == 'light' else 'NOVA Air Dark'
    name_ru = 'NOVA Air — светлая' if variant == 'light' else 'NOVA Air — тёмная'
    data = {
        'KPackageStructure': 'Plasma/LookAndFeel',
        'KPlugin': {
            'Authors': [{'Name': 'NOVA OS community project'}],
            'Category': '',
            'Description': 'NOVA Air: calm Plasma look with a centred taskbar (based on Breeze)',
            'Description[ru]': 'NOVA Air: спокойное оформление Plasma с центрированной панелью (на основе Breeze)',
            'Id': pid,
            'License': 'GPL-2.0-or-later',
            'Name': name,
            'Name[ru]': name_ru,
            'Version': VERSION,
            'Website': '',
        },
        'X-Plasma-APIVersion': '2',
    }
    return json.dumps(data, ensure_ascii=False, indent=4) + '\n'


def system_kdeglobals() -> str:
    return ('# NOVA OS system defaults (user settings in ~/.config always win).\n'
            '# Generated by tools/gen-plasma-theme.py\n'
            '[General]\n'
            'ColorScheme=NovaAirLight\n'
            f'font={FONT}\nmenuFont={FONT}\ntoolBarFont={FONT}\nsmallestReadableFont={SMALL_FONT}\n'
            f'fixed={MONO_FONT}\n\n'
            '[Icons]\nTheme=breeze\n\n'
            '[KDE]\n'
            f'LookAndFeelPackage={layout.LNF["light"]}\n'
            'widgetStyle=Breeze\n'
            'SingleClick=false\n'
            'AnimationDurationFactor=1\n\n'
            + color_groups('light'))


STATIC = {
    'etc/xdg/plasmarc': '[Theme]\nname=default\n',
    'etc/xdg/kcminputrc': '[Mouse]\ncursorTheme=breeze_cursors\n',
    'etc/xdg/ksplashrc': '[KSplash]\nTheme=org.kde.breeze.desktop\n',
    'etc/xdg/kwinrc': ('# NOVA OS defaults\n[org.kde.kdecoration2]\nlibrary=org.kde.breeze\ntheme=Breeze\n'
                       'BorderSize=Tiny\nBorderSizeAuto=false\n\n[Plugins]\nblurEnabled=true\n\n'
                       '# On-screen keyboard (Plasma 6 shows it only for touch input).\n'
                       '[Wayland]\nInputMethod[$e]=/usr/share/applications/com.github.maliit.keyboard.desktop\n'),
    'etc/xdg/kxkbrc': ('# NOVA OS: English + Russian, Alt+Shift switches layout\n[Layout]\n'
                       'LayoutList=us,ru\nOptions=grp:alt_shift_toggle\nResetOldOptions=true\n'
                       'Use=true\nDisplayNames=,\nVariantList=,\n'),
    'etc/xdg/kscreenlockerrc': ('[Greeter]\nWallpaperPlugin=org.kde.image\n\n'
                                '[Greeter][Wallpaper][org.kde.image][General]\n'
                                f'Image={layout.WALLPAPER}\n'),
    'etc/sddm.conf.d/10-nova.conf': ('# NOVA OS login screen: Breeze theme with the NOVA wallpaper.\n'
                                     '[Theme]\nCurrent=breeze\nCursorTheme=breeze_cursors\n'),
    'usr/share/sddm/themes/breeze/theme.conf.user': (
        '[General]\ntype=image\nbackground=/usr/share/wallpapers/NOVA/contents/images/1920x1080.png\n'),
    'usr/share/wallpapers/NOVA/metadata.json': json.dumps({
        'KPlugin': {'Authors': [{'Name': 'NOVA OS community project'}], 'Id': 'NOVA',
                    'License': 'NOVA OS project artwork', 'Name': 'NOVA Air'}}, indent=4) + '\n',
}


def outputs() -> dict[str, str]:
    files = dict(STATIC)
    files['usr/share/color-schemes/NovaAirLight.colors'] = colors_file('light')
    files['usr/share/color-schemes/NovaAirDark.colors'] = colors_file('dark')
    files['etc/xdg/kdeglobals'] = system_kdeglobals()
    files['etc/xdg/kglobalshortcutsrc'] = hotkeys.system_file()
    files['etc/xdg/plasmaparc'] = ('# NOVA OS: volume keys change volume by 2 % like Windows (KDE default: 5 %).\n'
                                   '[General]\nVolumeStep=2\nRaiseMaximumVolume=false\n')
    files['etc/modules-load.d/nova-ddc.conf'] = ('# NOVA OS: i2c-dev lets ddcutil/PowerDevil change the brightness of\n'
                                                 '# external monitors over DDC/CI (NOVA Display). Harmless without monitors.\n'
                                                 'i2c-dev\n')
    for variant in ('light', 'dark'):
        base = f'usr/share/plasma/look-and-feel/{layout.LNF[variant]}'
        files[f'{base}/metadata.json'] = lnf_metadata(variant)
        files[f'{base}/contents/defaults'] = lnf_defaults(variant)
        files[f'{base}/contents/layouts/org.kde.plasma.desktop-layout.js'] = layout.lnf_layout_script('windows')
    files.update(neon_outputs())
    files.update(style_outputs())
    return files


def style_outputs() -> dict[str, str]:
    """NOVA styles (Aurora, Sakura, Ocean) + NOVA Live wallpaper + static wallpaper packages."""
    out = {}
    for style in styles.NEW_LNF:
        st = styles.STYLES[style]
        out[f'usr/share/color-schemes/{st["scheme"]}.colors'] = colors_file(st['variant'])
        base = f'usr/share/plasma/look-and-feel/{layout.LNF[st["lnf"]]}'
        out[f'{base}/metadata.json'] = styles.lnf_metadata(style, VERSION)
        out[f'{base}/contents/defaults'] = styles.lnf_defaults(style)
        out[f'{base}/contents/layouts/org.kde.plasma.desktop-layout.js'] = styles.lnf_layout_script(style)
    wp = f'usr/share/plasma/wallpapers/{styles.LIVE_PLUGIN}'
    out[f'{wp}/metadata.json'] = styles.live_metadata(VERSION)
    out[f'{wp}/contents/config/main.xml'] = styles.live_kcfg()
    for package, name in (('NOVA-Aurora', 'NOVA Aurora'), ('NOVA-Sakura', 'NOVA Sakura'),
                          ('NOVA-Ocean', 'NOVA Ocean'), ('NOVA-Horizon', 'NOVA Horizon')):
        out[f'usr/share/wallpapers/{package}/metadata.json'] = styles.wallpaper_metadata(package, name)
    return out


def style_images() -> None:
    """Look-and-feel previews of the new styles from their wallpaper artwork."""
    from PIL import Image
    for style in styles.NEW_LNF:
        src = OVERLAY / f'usr/share/wallpapers/{styles.THUMBS[style]}/contents/images/1920x1080.jpg'
        prev = OVERLAY / f'usr/share/plasma/look-and-feel/{layout.LNF[styles.STYLES[style]["lnf"]]}/contents/previews'
        prev.mkdir(parents=True, exist_ok=True)
        if src.is_file() and not (prev / 'preview.png').exists():
            Image.open(src).convert('RGB').resize((640, 360)).save(prev / 'preview.png', optimize=True)
        if src.is_file() and not (prev / 'fullscreenpreview.jpg').exists():
            Image.open(src).convert('RGB').resize((1280, 720)).save(prev / 'fullscreenpreview.jpg', quality=86)


def neon_outputs() -> dict[str, str]:
    """NEON//SYS: everything text-based that is derived from tokens/constants."""
    t = TOKENS['neon']
    base = f'usr/share/plasma/look-and-feel/{neon.LNF}'
    wp = f'usr/share/plasma/wallpapers/{neon.WALLPAPER_PLUGIN}'
    return {
        f'usr/share/color-schemes/{neon.COLOR_SCHEME}.colors': colors_file('neon'),
        f'{base}/metadata.json': neon.lnf_metadata(VERSION),
        f'{base}/contents/defaults': neon.lnf_defaults(),
        f'{base}/contents/layouts/org.kde.plasma.desktop-layout.js': neon.lnf_layout_script(),
        f'{wp}/metadata.json': neon.wallpaper_metadata(VERSION),
        f'usr/share/plasma/plasmoids/{neon.STATS_PLASMOID}/metadata.json': neon.stats_metadata(VERSION),
        f'{wp}/contents/config/main.xml': neon.wallpaper_kcfg(),
        'usr/share/konsole/NovaNeon.colorscheme': neon.konsole_colorscheme(t),
        f'usr/share/konsole/{neon.KONSOLE_PROFILE}': neon.konsole_profile(),
        f'usr/share/sounds/{neon.SOUND_THEME}/index.theme': neon.sound_index(),
        'usr/share/wallpapers/NOVA-NEON/metadata.json': json.dumps({
            'KPlugin': {'Authors': [{'Name': 'NOVA OS community project'}], 'Id': 'NOVA-NEON',
                        'License': 'NOVA OS project artwork', 'Name': 'NEON//SYS'}}, indent=4) + '\n',
    }


def preview_png(variant: str, path: Path, size=(640, 400)) -> None:
    """Simple deterministic preview for the KDE theme chooser."""
    from PIL import Image, ImageDraw
    t = TOKENS[variant]
    w, h = size
    img = Image.new('RGB', size, t['bg'])
    d = ImageDraw.Draw(img)
    for y in range(h):  # soft vertical gradient
        k = y / h
        a = tuple(int(int(t['accent_soft'][i:i + 2], 16) * (1 - k) + int(t['bg'][i:i + 2], 16) * k) for i in (1, 3, 5))
        d.line([(0, y), (w, y)], fill=a)
    d.rounded_rectangle([90, 60, w - 90, h - 110], 16, fill=t['surface'], outline=t['border'])
    d.rounded_rectangle([110, 80, 260, h - 130], 10, fill=t['surface_alt'])
    for i in range(4):
        d.rounded_rectangle([280, 90 + i * 38, w - 110, 112 + i * 38], 8, fill=t['surface_alt'])
    d.rounded_rectangle([w // 2 - 130, h - 62, w // 2 + 130, h - 18], 14, fill=t['surface'], outline=t['border'])
    for i in range(6):
        x = w // 2 - 110 + i * 40
        d.rounded_rectangle([x, h - 52, x + 24, h - 28], 6, fill=t['accent'] if i == 0 else t['border_strong'])
    img.save(path, optimize=True)


def neon_scene_png(path: Path, size=(1920, 1080)) -> None:
    """Static NEON//SYS wallpaper (Synth Grid still): lock screen, login, fallback."""
    from PIL import Image, ImageDraw, ImageFilter
    t = TOKENS['neon']
    w, h = size
    hz = int(h * 0.62)
    img = Image.new('RGB', size, t['bg'])
    d = ImageDraw.Draw(img)

    def mix(a, b, k):
        a, b = a.lstrip('#'), b.lstrip('#')
        return tuple(int(int(a[i:i + 2], 16) * (1 - k) + int(b[i:i + 2], 16) * k) for i in (0, 2, 4))
    for y in range(hz):
        d.line([(0, y), (w, y)], fill=mix('#0a0320', '#3a0a4a', y / hz))
    for i in range(140):  # deterministic stars
        x, y = (i * 7919) % w, (i * 104729) % int(hz * 0.8)
        d.point((x, y), fill=(200, 220, 255))
    glow = Image.new('RGB', size, (0, 0, 0))
    g = ImageDraw.Draw(glow)
    cx, cy, r = w // 2, int(h * 0.42), int(h * 0.2)
    g.ellipse([cx - r * 1.4, cy - r * 1.4, cx + r * 1.4, cy + r * 1.4], fill=(120, 20, 70))
    glow = glow.filter(ImageFilter.GaussianBlur(radius=h // 14))
    img = Image.blend(img, Image.composite(glow, img, glow.convert('L')), 0.6)
    d = ImageDraw.Draw(img)
    for y in range(cy - r, cy + r):
        k = (y - (cy - r)) / (2 * r)
        half = int((r * r - (y - cy) ** 2) ** 0.5)
        band = max(4, int(r * 0.13))
        stripe = y > cy and (y - cy) % band < band * (y - cy) / r * 0.55
        if not stripe:
            d.line([(cx - half, y), (cx + half, y)], fill=mix(t['neon_yellow'], t['neon_magenta'], k))
    pts = [(0, hz)]
    for i in range(25):
        x = i * w / 24
        pts.append((x, hz - h * 0.08 * abs(__import__('math').sin(x * 0.011 + 1)) * (1 - abs(x / w - 0.5) * 0.6)))
    pts.append((w, hz))
    d.polygon(pts, fill='#12041f')
    d.rectangle([0, hz, w, h], fill='#05010d')
    line = mix(t['neon_magenta'], '#05010d', 0.25)
    for i in range(18):
        z = (i + 0.5) / 18
        y = hz + (h - hz) * z * z
        d.line([(0, y), (w, y)], fill=mix('#05010d', t['neon_magenta'], z), width=max(1, w // 1200))
    for i in range(-16, 17):
        d.line([(cx + i * w * 0.012, hz), (cx + i * w * 0.16, h)], fill=line, width=max(1, w // 1200))
    img.save(path, optimize=True)


def neon_images() -> None:
    walls = OVERLAY / 'usr/share/wallpapers/NOVA-NEON/contents/images'
    walls.mkdir(parents=True, exist_ok=True)
    if not (walls / '1920x1080.png').exists():
        neon_scene_png(walls / '1920x1080.png')
    shot = OVERLAY / 'usr/share/wallpapers/NOVA-NEON/contents/screenshot.png'
    if not shot.exists():
        neon_scene_png(shot, size=(400, 225))
    prev = OVERLAY / f'usr/share/plasma/look-and-feel/{neon.LNF}/contents/previews'
    prev.mkdir(parents=True, exist_ok=True)
    if not (prev / 'preview.png').exists():
        neon_scene_png(prev / 'preview.png', size=(640, 360))
    if not (prev / 'fullscreenpreview.jpg').exists():
        from PIL import Image
        neon_scene_png(prev / 'full.png', size=(1280, 720))
        Image.open(prev / 'full.png').convert('RGB').save(prev / 'fullscreenpreview.jpg', quality=88)
        (prev / 'full.png').unlink()


def main(argv):
    check = '--check' in argv
    changed = []
    for rel, text in sorted(outputs().items()):
        path = OVERLAY / rel
        old = path.read_text(encoding='utf-8') if path.exists() else None
        if old != text:
            changed.append(rel)
            if not check:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(text, encoding='utf-8')
    if not check:
        neon_images()
        style_images()
        for variant in ('light', 'dark'):
            prev = OVERLAY / f'usr/share/plasma/look-and-feel/{layout.LNF[variant]}/contents/previews'
            prev.mkdir(parents=True, exist_ok=True)
            if not (prev / 'preview.png').exists():
                preview_png(variant, prev / 'preview.png')
            if not (prev / 'fullscreenpreview.jpg').exists():
                preview_png(variant, prev / 'fullscreenpreview.png', size=(1280, 800))
                from PIL import Image
                Image.open(prev / 'fullscreenpreview.png').convert('RGB').save(prev / 'fullscreenpreview.jpg', quality=88)
                (prev / 'fullscreenpreview.png').unlink()
    if check and changed:
        print('Out of date:', *changed, sep='\n  ')
        return 1
    print(('Up to date' if not changed else 'Written:\n  ' + '\n  '.join(changed)) + f'  (NOVA {VERSION}, ui {nova_version()})')
    return 0


if __name__ == '__main__':
    raise SystemExit(main(sys.argv[1:]))
