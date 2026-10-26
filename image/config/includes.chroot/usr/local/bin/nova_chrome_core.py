#!/usr/bin/env python3
"""NOVA window chrome and motion: window-frame themes in two design languages.

* Fluent — the Windows 11 language: 32 px title bar, 46×32 caption buttons on
  the right with thin glyphs, red close button on hover, 8 px corners, 1 px
  hairline border, soft shadow, title on the left with the app icon.
* Aqua — the macOS language: three round "traffic light" buttons on the left
  (glyphs appear on hover, grey when the window is inactive), centred title,
  12 px corners, larger softer shadow.

Both are drawn from scratch (no third-party artwork) as KWin Aurorae themes,
one per NOVA colour variant so the title bar blends with the app toolbar.
Motion presets tune KWin's built-in effects the same way the two systems do
(Windows 11: quick scale/fade, squash to the taskbar; macOS: scale, magic lamp
into the dock, slide between desktops).
"""
from __future__ import annotations

import json

import nova_ui as ui

FAMILIES = ('fluent', 'aqua')
VARIANTS = ('light', 'dark', 'neon', 'aurora', 'sakura', 'ocean')
AURORAE = 'org.kde.kwin.aurorae'

GEOMETRY = {
    #           title  radius  shadow pad  shadow alpha (active, inactive)  border
    'fluent': {'title': 32, 'radius': 8, 'pad': 18, 'pad_top': 14, 'pad_bottom': 24, 'alpha': (0.34, 0.17)},
    'aqua': {'title': 30, 'radius': 12, 'pad': 26, 'pad_top': 18, 'pad_bottom': 36, 'alpha': (0.42, 0.2)},
}
# KWin button letters: M window menu (app icon), I minimise, A maximise, X close
BUTTONS = {'fluent': ('M', 'IAX'), 'aqua': ('XIA', '')}
TRAFFIC = {  # (fill, ring, glyph) — the universally known stop / wait / go colours
    'close': ('#ff5f57', '#e0443e', '#4d0000'),
    'minimize': ('#febc2e', '#dea123', '#995700'),
    'maximize': ('#28c840', '#1aab29', '#006500'),
}


def validate(family: str, variant: str) -> tuple[str, str]:
    if family not in FAMILIES:
        raise ValueError(f'Неизвестное оформление окон: {family!r}')
    if variant not in VARIANTS:
        raise ValueError(f'Неизвестный вариант цветов: {variant!r}')
    return family, variant


def theme_id(family: str, variant: str) -> str:
    validate(family, variant)
    return f'NOVA-{family.capitalize()}-{variant.capitalize()}'


def kwin_theme(family: str, variant: str) -> str:
    return '__aurorae__svg__' + theme_id(family, variant)


def _hex(c: str) -> tuple[int, int, int]:
    return int(c[1:3], 16), int(c[3:5], 16), int(c[5:7], 16)


def _mix(a: str, b: str, k: float) -> str:
    ra, ga, ba = _hex(a)
    rb, gb, bb = _hex(b)
    return '#%02x%02x%02x' % (round(ra + (rb - ra) * k), round(ga + (gb - ga) * k), round(ba + (bb - ba) * k))


def _is_dark(c: str) -> bool:
    r, g, b = _hex(c)
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) < 128


def palette(variant: str) -> dict:
    t = ui.TOKENS[variant]
    dark = _is_dark(t['bg'])
    return {
        'title': t['bg'],
        'title_inactive': _mix(t['bg'], t['surface'], 0.6),
        'text': t['text'],
        'text_inactive': t['text_muted'],
        'border': _mix(t['bg'], '#ffffff' if dark else '#000000', 0.16 if dark else 0.14),
        'border_inactive': _mix(t['bg'], '#ffffff' if dark else '#000000', 0.10 if dark else 0.09),
        'glyph': t['text'],
        'glyph_inactive': t['text_muted'],
        'hover': _mix(t['bg'], '#ffffff' if dark else '#000000', 0.09 if dark else 0.06),
        'pressed': _mix(t['bg'], '#ffffff' if dark else '#000000', 0.05 if dark else 0.10),
        'off': '#5b5f66' if dark else '#d4d4d8',          # inactive traffic lights
        'off_ring': '#4a4e55' if dark else '#c2c2c7',
        'dark': dark,
    }

# ---------------------------------------------------------------- SVG helpers


class _Svg:
    """Each element is placed in its own cell; an invisible rect fixes its exact bounding box."""

    def __init__(self):
        self.parts, self.defs, self.x, self.n = [], [], 0, 0

    def element(self, eid: str, w: float, h: float, body: str) -> None:
        x = self.x
        self.parts.append(f'<g id="{eid}" transform="translate({x},0)">'
                          f'<rect x="0" y="0" width="{w}" height="{h}" fill="#000000" fill-opacity="0"/>{body}</g>')
        self.x += w + 4

    def gradient(self, kind: str, attrs: str, stops: list[tuple[float, str, float]]) -> str:
        self.n += 1
        gid = f'g{self.n}'
        s = ''.join(f'<stop offset="{o:.4f}" stop-color="{c}" stop-opacity="{a:.4f}"/>' for o, c, a in stops)
        self.defs.append(f'<{kind}Gradient id="{gid}" gradientUnits="userSpaceOnUse" {attrs}>{s}</{kind}Gradient>')
        return f'url(#{gid})'

    def render(self, height: float) -> str:
        return ('<?xml version="1.0" encoding="UTF-8"?>\n'
                f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.x}" height="{height}">'
                f'<defs>{"".join(self.defs)}</defs>{"".join(self.parts)}</svg>\n')


def _fade(alpha: float) -> list[tuple[float, str, float]]:
    """Soft shadow falloff (strong near the window, long tail)."""
    return [(0.0, '#000000', alpha), (0.25, '#000000', alpha * 0.55), (0.55, '#000000', alpha * 0.2),
            (1.0, '#000000', 0.0)]


def decoration_svg(family: str, variant: str) -> str:
    validate(family, variant)
    g, p = GEOMETRY[family], palette(variant)
    R, T = g['radius'], g['title']
    pl = pr = g['pad']
    pt, pb = g['pad_top'], g['pad_bottom']
    svg = _Svg()
    tallest = 0
    for state, title, border, alpha in (('decoration', p['title'], p['border'], g['alpha'][0]),
                                        ('decoration-inactive', p['title_inactive'], p['border_inactive'],
                                         g['alpha'][1])):
        def edge(x1, y1, x2, y2):
            return svg.gradient('linear', f'x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}"', _fade(alpha))

        def corner(cx, cy, r_in, r_out, r_out_y=None):
            # elliptical falloff when the shadow reaches further sideways than up/down
            k = r_in / r_out
            stops = [(0.0, '#000000', alpha)] + [(k + (1 - k) * o, c, a) for o, c, a in _fade(alpha)]
            sy = (r_out_y or r_out) / r_out
            tf = f' gradientTransform="translate({cx},{cy}) scale(1,{sy:.4f}) translate({-cx},{-cy})"' if sy != 1 else ''
            return svg.gradient('radial', f'cx="{cx}" cy="{cy}" r="{r_out}" fx="{cx}" fy="{cy}"{tf}', stops)

        # --- top-left: (pl+R) × (pt+T) — shadow, rounded corner, title fill, hairline
        w, h = pl + R, pt + T
        body = (f'<rect x="0" y="0" width="{w}" height="{pt + R}" fill="{corner(pl + R, pt + R, R, R + pl, R + pt)}"/>'
                f'<rect x="0" y="{pt + R}" width="{pl}" height="{T - R}" fill="{edge(pl, 0, 0, 0)}"/>'
                f'<path d="M{pl},{h} L{pl},{pt + R} A{R},{R} 0 0 1 {pl + R},{pt} L{w},{pt} L{w},{h} Z" fill="{title}"/>'
                f'<path d="M{pl + 0.5},{h} L{pl + 0.5},{pt + R} A{R - 0.5},{R - 0.5} 0 0 1 {pl + R},{pt + 0.5} '
                f'L{w},{pt + 0.5}" fill="none" stroke="{border}" stroke-width="1"/>')
        svg.element(f'{state}-topleft', w, h, body)
        # --- top-right (mirror)
        body = (f'<rect x="0" y="0" width="{w}" height="{pt + R}" fill="{corner(0, pt + R, R, R + pr, R + pt)}"/>'
                f'<rect x="{R}" y="{pt + R}" width="{pr}" height="{T - R}" fill="{edge(R, 0, R + pr, 0)}"/>'
                f'<path d="M{R},{h} L{R},{pt + R} A{R},{R} 0 0 0 0,{pt} L0,{pt} L0,{h} Z" fill="{title}"/>'
                f'<path d="M0,{pt + 0.5} L0,{pt + 0.5} A{R - 0.5},{R - 0.5} 0 0 1 {R - 0.5},{pt + R} L{R - 0.5},{h}" '
                f'fill="none" stroke="{border}" stroke-width="1"/>')
        svg.element(f'{state}-topright', w, h, body)
        # --- top (stretched horizontally)
        body = (f'<rect x="0" y="0" width="1" height="{pt}" fill="{edge(0, pt, 0, 0)}"/>'
                f'<rect x="0" y="{pt}" width="1" height="{T}" fill="{title}"/>'
                f'<rect x="0" y="{pt}" width="1" height="1" fill="{border}"/>')
        svg.element(f'{state}-top', 1, h, body)
        # --- center (behind the client; also the maximised title bar)
        svg.element(f'{state}-center', 1, 1, f'<rect x="0" y="0" width="1" height="1" fill="{title}"/>')
        # --- left / right (stretched vertically): shadow, hairline, then hidden under the client
        body = (f'<rect x="0" y="0" width="{pl}" height="1" fill="{edge(pl, 0, 0, 0)}"/>'
                f'<rect x="{pl}" y="0" width="1" height="1" fill="{border}"/>'
                f'<rect x="{pl + 1}" y="0" width="{R - 1}" height="1" fill="{title}"/>')
        svg.element(f'{state}-left', pl + R, 1, body)
        body = (f'<rect x="{R}" y="0" width="{pr}" height="1" fill="{edge(R, 0, R + pr, 0)}"/>'
                f'<rect x="{R - 1}" y="0" width="1" height="1" fill="{border}"/>'
                f'<rect x="0" y="0" width="{R - 1}" height="1" fill="{title}"/>')
        svg.element(f'{state}-right', pr + R, 1, body)
        # --- bottom row: R px hidden under the client, hairline, shadow (square bottom corners)
        hb = R + pb
        body = (f'<rect x="0" y="0" width="1" height="{R - 1}" fill="{title}"/>'
                f'<rect x="0" y="{R - 1}" width="1" height="1" fill="{border}"/>'
                f'<rect x="0" y="{R}" width="1" height="{pb}" fill="{edge(0, R, 0, R + pb)}"/>')
        svg.element(f'{state}-bottom', 1, hb, body)
        body = (f'<rect x="0" y="0" width="{pl}" height="{R}" fill="{edge(pl, 0, 0, 0)}"/>'
                f'<rect x="{pl}" y="{R}" width="{R}" height="{pb}" fill="{edge(0, R, 0, R + pb)}"/>'
                f'<rect x="0" y="{R}" width="{pl}" height="{pb}" fill="{corner(pl, R, 0.01, pl, pb)}"/>'
                f'<rect x="{pl + 1}" y="0" width="{R - 1}" height="{R - 1}" fill="{title}"/>'
                f'<path d="M{pl + 0.5},0 L{pl + 0.5},{R - 0.5} L{pl + R},{R - 0.5}" fill="none" stroke="{border}"/>')
        svg.element(f'{state}-bottomleft', pl + R, hb, body)
        body = (f'<rect x="{R}" y="0" width="{pr}" height="{R}" fill="{edge(R, 0, R + pr, 0)}"/>'
                f'<rect x="0" y="{R}" width="{R}" height="{pb}" fill="{edge(0, R, 0, R + pb)}"/>'
                f'<rect x="{R}" y="{R}" width="{pr}" height="{pb}" fill="{corner(R, R, 0.01, pr, pb)}"/>'
                f'<rect x="0" y="0" width="{R - 1}" height="{R - 1}" fill="{title}"/>'
                f'<path d="M0,{R - 0.5} L{R - 0.5},{R - 0.5} L{R - 0.5},0" fill="none" stroke="{border}"/>')
        svg.element(f'{state}-bottomright', pr + R, hb, body)
        tallest = max(tallest, h, hb)
    # maximised windows: only the centre is used (flat title bar, no corners, no shadow)
    svg.element('decoration-maximized-center', 1, 1, f'<rect x="0" y="0" width="1" height="1" fill="{p["title"]}"/>')
    svg.element('decoration-maximized-inactive-center', 1, 1,
                f'<rect x="0" y="0" width="1" height="1" fill="{p["title_inactive"]}"/>')
    return svg.render(tallest)

# ---------------------------------------------------------------- buttons

_GLYPH = {   # Fluent caption glyphs on a 10×10 box, 1 px strokes
    'minimize': 'M0,5 L10,5',
    'maximize': 'M0.5,0.5 h9 v9 h-9 Z',
    'restore': 'M2.5,0.5 h7 v7 M0.5,2.5 h7 v7 h-7 Z',
    'close': 'M0,0 L10,10 M10,0 L0,10',
}


def _fluent_button(kind: str, variant: str) -> str:
    g, p = GEOMETRY['fluent'], palette(variant)
    w, h, R = 46, g['title'], g['radius']
    svg = _Svg()
    hover_bg = '#c42b1c' if kind == 'close' else p['hover']
    pressed_bg = '#b02a1e' if kind == 'close' else p['pressed']
    hover_glyph = '#ffffff' if kind == 'close' else p['glyph']
    # the close button sits in the rounded top-right corner of the window
    shape = (f'M0,0 L{w - R},0 A{R},{R} 0 0 1 {w},{R} L{w},{h} L0,{h} Z' if kind == 'close'
             else f'M0,0 H{w} V{h} H0 Z')
    gx, gy = (w - 10) / 2, (h - 10) / 2

    def face(bg: str | None, glyph: str, opacity: float = 1.0) -> str:
        back = f'<path d="{shape}" fill="{bg}"/>' if bg else ''
        return (back + f'<path transform="translate({gx},{gy})" d="{_GLYPH[kind]}" fill="none" stroke="{glyph}" '
                f'stroke-width="1" stroke-opacity="{opacity}" stroke-linecap="square"/>')
    svg.element('active-center', w, h, face(None, p['glyph']))
    svg.element('inactive-center', w, h, face(None, p['glyph_inactive']))
    svg.element('hover-center', w, h, face(hover_bg, hover_glyph))
    svg.element('hover-inactive-center', w, h, face(hover_bg, hover_glyph))
    svg.element('pressed-center', w, h, face(pressed_bg, hover_glyph, 0.85))
    svg.element('pressed-inactive-center', w, h, face(pressed_bg, hover_glyph, 0.85))
    svg.element('deactivated-center', w, h, face(None, p['glyph_inactive'], 0.4))
    svg.element('deactivated-inactive-center', w, h, face(None, p['glyph_inactive'], 0.4))
    return svg.render(h)


_AQUA_GLYPH = {   # drawn on hover inside a 12 px light
    'close': 'M3.6,3.6 L8.4,8.4 M8.4,3.6 L3.6,8.4',
    'minimize': 'M3.2,6 L8.8,6',
    'maximize': 'M3.4,8.6 L3.4,4.6 L7.4,8.6 Z M8.6,3.4 L8.6,7.4 L4.6,3.4 Z',
    'restore': 'M6,6 L6,2.6 L9.4,6 Z M6,6 L6,9.4 L2.6,6 Z',
}


def _aqua_button(kind: str, variant: str) -> str:
    p = palette(variant)
    fill, ring, glyph = TRAFFIC['maximize' if kind == 'restore' else kind]
    s = 14
    svg = _Svg()

    def light(color: str, edge: str, mark: str | None, dim: float = 1.0) -> str:
        out = (f'<circle cx="7" cy="7" r="6" fill="{color}" fill-opacity="{dim}"/>'
               f'<circle cx="7" cy="7" r="5.75" fill="none" stroke="{edge}" stroke-width="0.5"/>')
        if mark:
            filled = kind in ('maximize', 'restore')
            out += (f'<path transform="translate(1,1)" d="{_AQUA_GLYPH[kind]}" '
                    + (f'fill="{mark}" stroke="none"/>' if filled else
                       f'fill="none" stroke="{mark}" stroke-width="1.2" stroke-linecap="round"/>'))
        return out
    svg.element('active-center', s, s, light(fill, ring, None))
    svg.element('inactive-center', s, s, light(p['off'], p['off_ring'], None))
    svg.element('hover-center', s, s, light(fill, ring, glyph))
    svg.element('hover-inactive-center', s, s, light(fill, ring, glyph))
    svg.element('pressed-center', s, s, light(_mix(fill, '#000000', 0.18), ring, glyph))
    svg.element('pressed-inactive-center', s, s, light(_mix(fill, '#000000', 0.18), ring, glyph))
    svg.element('deactivated-center', s, s, light(p['off'], p['off_ring'], None, 0.6))
    svg.element('deactivated-inactive-center', s, s, light(p['off'], p['off_ring'], None, 0.6))
    return svg.render(s)


def button_svg(family: str, variant: str, kind: str) -> str:
    validate(family, variant)
    if kind not in _GLYPH:
        raise ValueError(kind)
    return _fluent_button(kind, variant) if family == 'fluent' else _aqua_button(kind, variant)

# ---------------------------------------------------------------- rc / metadata


def theme_rc(family: str, variant: str) -> str:
    validate(family, variant)
    g, p = GEOMETRY[family], palette(variant)
    left, right = BUTTONS[family]
    if family == 'fluent':
        layout = (f'TitleHeight={g["title"]}\nTitleEdgeTop=0\nTitleEdgeBottom=0\nTitleEdgeLeft=8\nTitleEdgeRight=0\n'
                  'TitleBorderLeft=8\nTitleBorderRight=8\nButtonWidth=46\nButtonWidthMenu=24\n'
                  f'ButtonHeight={g["title"]}\nButtonSpacing=0\nButtonMarginTop=0\nExplicitButtonSpacer=8\n'
                  f'TitleEdgeTopMaximized=0\nTitleEdgeBottomMaximized=0\nTitleEdgeLeftMaximized=8\n'
                  'TitleEdgeRightMaximized=0\n')
        align = 'Left'
    else:
        layout = (f'TitleHeight={g["title"]}\nTitleEdgeTop=0\nTitleEdgeBottom=0\nTitleEdgeLeft=13\nTitleEdgeRight=13\n'
                  'TitleBorderLeft=10\nTitleBorderRight=10\nButtonWidth=14\nButtonHeight=14\nButtonSpacing=8\n'
                  f'ButtonMarginTop={(g["title"] - 14) // 2}\nExplicitButtonSpacer=8\n'
                  f'TitleEdgeTopMaximized=0\nTitleEdgeBottomMaximized=0\nTitleEdgeLeftMaximized=13\n'
                  'TitleEdgeRightMaximized=13\n')
        align = 'Center'
    rgb = lambda c: '%d,%d,%d,255' % _hex(c)   # noqa: E731
    return ('[General]\n'
            f'TitleAlignment={align}\nTitleVerticalAlignment=Center\nAnimation=120\n'
            f'ActiveTextColor={rgb(p["text"])}\nInactiveTextColor={rgb(p["text_inactive"])}\n'
            f'LeftButtons={left}\nRightButtons={right}\nShadow=true\n\n'
            '[Layout]\nBorderLeft=1\nBorderRight=1\nBorderBottom=1\n' + layout
            + f'PaddingTop={g["pad_top"]}\nPaddingBottom={g["pad_bottom"]}\n'
            f'PaddingLeft={g["pad"]}\nPaddingRight={g["pad"]}\n')


def metadata(family: str, variant: str, version: str) -> str:
    tid = theme_id(family, variant)
    names = {'fluent': ('NOVA Fluent', 'кнопки справа, как в Windows 11'),
             'aqua': ('NOVA Aqua', 'цветные кнопки слева, как в macOS')}
    title, note = names[family]
    return ('[Desktop Entry]\n'
            f'Name={title} ({variant})\nName[ru]={title} ({variant})\n'
            f'Comment=NOVA window frame — {family}\nComment[ru]=Рамка окон NOVA: {note}\n'
            f'X-KDE-PluginInfo-Name={tid}\nX-KDE-PluginInfo-Author=NOVA OS community project\n'
            f'X-KDE-PluginInfo-Version={version}\nX-KDE-PluginInfo-License=GPL-2.0-or-later\n'
            'X-KDE-PluginInfo-Website=\nX-KDE-PluginInfo-Email=\n')


def theme_files(family: str, variant: str, version: str) -> dict[str, str]:
    tid = theme_id(family, variant)
    base = f'usr/share/aurorae/themes/{tid}'
    out = {f'{base}/metadata.desktop': metadata(family, variant, version),
           f'{base}/{tid}rc': theme_rc(family, variant),
           f'{base}/decoration.svg': decoration_svg(family, variant)}
    for kind in _GLYPH:
        out[f'{base}/{kind}.svg'] = button_svg(family, variant, kind)
    return out


def all_theme_files(version: str) -> dict[str, str]:
    out = {}
    for family in FAMILIES:
        for variant in VARIANTS:
            out.update(theme_files(family, variant, version))
    return out

# ---------------------------------------------------------------- motion

# (file, group, key, value). Effects are KWin built-ins; durations follow each system's feel.
MOTION = {
    'fluent': [   # Windows 11: snappy (≈ 167–250 ms), windows scale+fade, minimise squashes to the taskbar
        ('kdeglobals', 'KDE', 'AnimationDurationFactor', '0.75'),
        ('kwinrc', 'Plugins', 'scaleEnabled', 'true'),
        ('kwinrc', 'Plugins', 'glideEnabled', 'false'),
        ('kwinrc', 'Plugins', 'squashEnabled', 'true'),
        ('kwinrc', 'Plugins', 'magiclampEnabled', 'false'),
        ('kwinrc', 'Plugins', 'slideEnabled', 'true'),
        ('kwinrc', 'Plugins', 'blurEnabled', 'true'),
        ('kwinrc', 'Plugins', 'contrastEnabled', 'true'),
        ('kwinrc', 'Effect-blur', 'BlurStrength', '10'),
        ('kwinrc', 'Effect-blur', 'NoiseStrength', '4'),     # acrylic-like grain
        ('kwinrc', 'Effect-overview', 'BorderActivate', '9'),
    ],
    'aqua': [     # macOS: slightly slower, smooth; minimise with the magic lamp into the dock
        ('kdeglobals', 'KDE', 'AnimationDurationFactor', '0.9'),
        ('kwinrc', 'Plugins', 'scaleEnabled', 'true'),
        ('kwinrc', 'Plugins', 'glideEnabled', 'false'),
        ('kwinrc', 'Plugins', 'squashEnabled', 'false'),
        ('kwinrc', 'Plugins', 'magiclampEnabled', 'true'),
        ('kwinrc', 'Plugins', 'slideEnabled', 'true'),
        ('kwinrc', 'Plugins', 'blurEnabled', 'true'),
        ('kwinrc', 'Plugins', 'contrastEnabled', 'true'),
        ('kwinrc', 'Effect-blur', 'BlurStrength', '12'),
        ('kwinrc', 'Effect-blur', 'NoiseStrength', '0'),
        ('kwinrc', 'Effect-overview', 'BorderActivate', '7'),   # top-left hot corner, like Mission Control
    ],
}


def chrome_entries(family: str, variant: str) -> list[tuple[str, str, str, str]]:
    left, right = BUTTONS[family]
    return [('kwinrc', 'org.kde.kdecoration2', 'library', AURORAE),
            ('kwinrc', 'org.kde.kdecoration2', 'theme', kwin_theme(family, variant)),
            ('kwinrc', 'org.kde.kdecoration2', 'ButtonsOnLeft', left),
            ('kwinrc', 'org.kde.kdecoration2', 'ButtonsOnRight', right),
            ('kwinrc', 'org.kde.kdecoration2', 'BorderSize', 'Normal'),
            ('kwinrc', 'org.kde.kdecoration2', 'BorderSizeAuto', 'false')] + MOTION[family]


def system_kwinrc(family: str, variant: str) -> str:
    """/etc/xdg/kwinrc groups for the default frame and motion (kdeglobals entries are written elsewhere)."""
    groups: dict[str, list[str]] = {}
    for file, group, key, value in chrome_entries(family, variant):
        if file == 'kwinrc':
            groups.setdefault(group, []).append(f'{key}={value}')
    return ''.join(f'[{g}]\n' + '\n'.join(lines) + '\n\n' for g, lines in groups.items())


def lnf_section(family: str, variant: str) -> str:
    """Look-and-feel `defaults` lines for the frame (applied by plasma-apply-lookandfeel)."""
    left, right = BUTTONS[family]
    return (f'[kwinrc][org.kde.kdecoration2]\nlibrary={AURORAE}\ntheme={kwin_theme(family, variant)}\n'
            f'ButtonsOnLeft={left}\nButtonsOnRight={right}\n')


def current_theme(home=None) -> tuple[str, str] | None:
    """(family, variant) of the NOVA frame in use, or None for any other decoration."""
    import nova_styles_core as styles
    value = styles.kde_value(home, 'kwinrc', 'org.kde.kdecoration2', 'theme') or ''
    for family in FAMILIES:
        for variant in VARIANTS:
            if value == kwin_theme(family, variant):
                return family, variant
    return None


def json_dump(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, indent=1)
