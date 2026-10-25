#!/usr/bin/env python3
"""NOVA Air UI kit (PyQt6) — one look and behaviour for every NOVA application.

The first half of this module is pure Python (tokens, theme detection, QSS
generation, geometry maths) so it can be unit-tested without Qt. Qt widgets
are imported lazily in the second half.

Environment switches (for tests/CI, harmless in production):
  NOVA_THEME=light|dark|neon|auto  overrides ~/.config/nova/theme
  NOVA_SCREEN_OVERRIDE=WxH       pretend the available screen area is WxH
  NOVA_REDUCED_MOTION=1          disable animations
  NOVA_UI_SMOKE=/dir             grab the main window to /dir/<app>.png + .json and quit
"""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

# --------------------------------------------------------------------------
# Version
# --------------------------------------------------------------------------

def nova_version(release_file: str | os.PathLike = '/etc/nova-release') -> str:
    try:
        for line in Path(release_file).read_text(encoding='utf-8').splitlines():
            if line.startswith('NOVA_OS_VERSION='):
                value = line.split('=', 1)[1].strip()
                if re.fullmatch(r'\d+\.\d+(\.\d+)?', value):
                    return value
    except OSError:
        pass
    return 'dev'

# --------------------------------------------------------------------------
# Design tokens (NOVA Air). Contrast of text pairs >= 4.5:1 (checked in tests).
# --------------------------------------------------------------------------

FONT_STACK = '"Inter", "Noto Sans", "DejaVu Sans", sans-serif'
BASE_FONT_PX = 13
CONTROL_HEIGHT = 36          # >= 36 px: comfortable for touchpad and touch
SPACING = {'xs': 4, 's': 8, 'm': 12, 'l': 16, 'xl': 24}
RADIUS = {'s': 8, 'm': 10, 'l': 14}
BREAKPOINT_COMPACT = 820     # below this window width navigation collapses

TOKENS = {
    'light': {
        'bg': '#f4f6fa', 'surface': '#ffffff', 'surface_alt': '#eef2f8',
        'border': '#dbe2ec', 'border_strong': '#c3cedd',
        'text': '#162033', 'text_muted': '#4b5870', 'text_disabled': '#8b95a6',
        'accent': '#1f6feb', 'accent_text': '#ffffff', 'accent_soft': '#dbe9ff',
        'accent_soft_text': '#0f4fb8', 'accent_hover': '#1a5fd0',
        'danger': '#c62f3c', 'danger_text': '#ffffff', 'success': '#1c7c4b',
        'warning': '#8a5a00', 'selection': '#cfe2ff', 'brand': '#1159c9',
    },
    'dark': {
        'bg': '#11161f', 'surface': '#1a2230', 'surface_alt': '#212b3b',
        'border': '#2e3a4d', 'border_strong': '#43536b',
        'text': '#e8eef7', 'text_muted': '#a9b6ca', 'text_disabled': '#69768a',
        'accent': '#4c93ff', 'accent_text': '#08111f', 'accent_soft': '#23395b',
        'accent_soft_text': '#cfe2ff', 'accent_hover': '#6aa6ff',
        'danger': '#ff6b77', 'danger_text': '#1a0508', 'success': '#5fd39a',
        'warning': '#f2c46b', 'selection': '#2c4a78', 'brand': '#8bbcff',
    },
    # NEON//SYS: dark violet base, cyan accent, magenta and yellow highlights.
    # Same keys as NOVA Air (+ neon_* extras), same >= 4.5:1 contrast rules.
    'neon': {
        'bg': '#0b0714', 'surface': '#140d24', 'surface_alt': '#1d1433',
        'border': '#33255a', 'border_strong': '#55418f',
        'text': '#eafcff', 'text_muted': '#b3a6d6', 'text_disabled': '#6f6296',
        'accent': '#00e5f2', 'accent_text': '#05030b', 'accent_soft': '#0d3540',
        'accent_soft_text': '#a6f8ff', 'accent_hover': '#5cf2fa',
        'danger': '#ff4f8b', 'danger_text': '#0b0714', 'success': '#3dffa8',
        'warning': '#fcee0a', 'selection': '#3b2366', 'brand': '#fcee0a',
        'neon_magenta': '#ff2a6d', 'neon_cyan': '#00f0ff', 'neon_yellow': '#fcee0a', 'neon_violet': '#b967ff',
    },
}

VARIANTS = ('light', 'dark')            # NOVA Air
ALL_VARIANTS = VARIANTS + ('neon',)     # + NEON//SYS
CHOICES = ('auto', 'light', 'dark', 'neon')
NEON_SCHEME = 'NovaNeon'
NEON_FONT = '"Orbitron", "Inter", "Noto Sans", sans-serif'      # Latin headings only (no Cyrillic in Orbitron)
NEON_MONO = '"Share Tech Mono", "Noto Sans Mono", monospace'


def _hex_to_rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip('#')
    return int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16)


def relative_luminance(color: str) -> float:
    def channel(c: int) -> float:
        c = c / 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (channel(c) for c in _hex_to_rgb(color))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast_ratio(a: str, b: str) -> float:
    la, lb = sorted((relative_luminance(a), relative_luminance(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)

# --------------------------------------------------------------------------
# Theme choice and detection
# --------------------------------------------------------------------------

def choice_file(home: str | os.PathLike | None = None) -> Path:
    base = Path(home) if home else Path.home()
    return base / '.config/nova/theme'


def read_choice(home=None) -> str:
    env = os.environ.get('NOVA_THEME', '').strip().lower()
    if env in CHOICES:
        return env
    try:
        value = choice_file(home).read_text(encoding='utf-8').strip().lower()
    except (OSError, UnicodeError):
        return 'auto'
    return value if value in CHOICES else 'auto'


def save_choice(choice: str, home=None) -> Path:
    if choice not in CHOICES:
        raise ValueError(f'unknown theme choice: {choice}')
    path = choice_file(home)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix('.tmp')
    tmp.write_text(choice + '\n', encoding='utf-8')
    os.replace(tmp, path)
    return path


def _kde_value(text: str, group: str, key: str) -> str | None:
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


def detect_plasma_variant(home=None, system_file='/etc/xdg/kdeglobals') -> str:
    """Return 'neon', 'dark' or 'light' from the user's (then system) KDE colours."""
    base = Path(home) if home else Path.home()
    for path in (base / '.config/kdeglobals', Path(system_file)):
        try:
            text = path.read_text(encoding='utf-8', errors='replace')
        except OSError:
            continue
        if (_kde_value(text, 'General', 'ColorScheme') or '') == NEON_SCHEME:
            return 'neon'
        bg = _kde_value(text, 'Colors:Window', 'BackgroundNormal')
        if bg and re.fullmatch(r'\d{1,3},\d{1,3},\d{1,3}(,\d{1,3})?', bg):
            r, g, b = (int(x) for x in bg.split(',')[:3])
            return 'dark' if (0.299 * r + 0.587 * g + 0.114 * b) < 128 else 'light'
        scheme = _kde_value(text, 'General', 'ColorScheme')
        if scheme:
            return 'dark' if 'dark' in scheme.lower() else 'light'
    return 'light'


def resolve_variant(home=None) -> str:
    choice = read_choice(home)
    return detect_plasma_variant(home) if choice == 'auto' else choice

# --------------------------------------------------------------------------
# Stylesheet
# --------------------------------------------------------------------------

def build_stylesheet(variant: str = 'light') -> str:
    if variant not in TOKENS:
        variant = 'light'
    t = TOKENS[variant]
    r, s, h = RADIUS, SPACING, CONTROL_HEIGHT
    title = 'NEON//SYS' if variant == 'neon' else f'NOVA Air {variant}'
    return f"""/* {title} — generated by nova_ui.py (do not edit by hand) */
QWidget {{ background: {t['bg']}; color: {t['text']}; font-family: {FONT_STACK}; font-size: {BASE_FONT_PX}px; }}
QMainWindow, QDialog {{ background: {t['bg']}; }}
QToolTip {{ background: {t['surface']}; color: {t['text']}; border: 1px solid {t['border_strong']}; border-radius: {r['s']}px; padding: 6px 8px; }}
QLabel {{ background: transparent; }}
QLabel#brand {{ font-size: 24px; font-weight: 700; color: {t['brand']}; padding: 2px 0; }}
QLabel#heading {{ font-size: 17px; font-weight: 650; color: {t['text']}; }}
QLabel#description, QLabel[muted="true"] {{ color: {t['text_muted']}; }}
QLabel#status-ok {{ color: {t['success']}; font-weight: 600; }}
QLabel#status-warn {{ color: {t['warning']}; font-weight: 600; }}
QFrame#card {{ background: {t['surface']}; border: 1px solid {t['border']}; border-radius: {r['l']}px; }}
QFrame#card QLabel, QFrame#card QCheckBox, QFrame#card QRadioButton {{ background: transparent; }}
QListWidget, QTableWidget, QTreeWidget, QTextEdit, QPlainTextEdit {{ background: {t['surface']}; color: {t['text']}; border: 1px solid {t['border']}; border-radius: {r['m']}px; padding: {s['xs']}px; outline: 0; alternate-background-color: {t['surface_alt']}; selection-background-color: {t['selection']}; selection-color: {t['text']}; }}
QListWidget::item {{ padding: 9px 11px; border-radius: {r['s']}px; min-height: 20px; }}
QListWidget::item:hover {{ background: {t['surface_alt']}; }}
QListWidget::item:selected, QTableWidget::item:selected, QTreeWidget::item:selected {{ background: {t['accent_soft']}; color: {t['accent_soft_text']}; }}
QLineEdit, QComboBox, QSpinBox, QDoubleSpinBox {{ background: {t['surface']}; color: {t['text']}; border: 1px solid {t['border_strong']}; border-radius: {r['m']}px; padding: 6px 10px; min-height: {h - 14}px; selection-background-color: {t['selection']}; selection-color: {t['text']}; }}
QLineEdit:focus, QComboBox:focus, QSpinBox:focus, QDoubleSpinBox:focus {{ border: 2px solid {t['accent']}; }}
QComboBox QAbstractItemView {{ background: {t['surface']}; color: {t['text']}; border: 1px solid {t['border_strong']}; selection-background-color: {t['accent_soft']}; selection-color: {t['accent_soft_text']}; }}
QPushButton {{ background: {t['surface']}; color: {t['text']}; border: 1px solid {t['border_strong']}; border-radius: {r['m']}px; padding: 7px 14px; min-height: {h - 16}px; font-weight: 600; text-align: left; }}
QPushButton:hover {{ background: {t['surface_alt']}; border-color: {t['accent']}; }}
QPushButton:pressed {{ background: {t['accent_soft']}; }}
QPushButton:focus {{ border: 2px solid {t['accent']}; }}
QPushButton:disabled {{ color: {t['text_disabled']}; border-color: {t['border']}; background: {t['surface_alt']}; }}
QPushButton[variant="primary"] {{ background: {t['accent']}; color: {t['accent_text']}; border: 1px solid {t['accent']}; text-align: center; }}
QPushButton[variant="primary"]:hover {{ background: {t['accent_hover']}; }}
QPushButton[variant="danger"] {{ background: {t['surface']}; color: {t['danger']}; border: 1px solid {t['danger']}; }}
QPushButton[variant="danger"]:hover {{ background: {t['danger']}; color: {t['danger_text']}; }}
QPushButton[variant="nav"] {{ text-align: center; }}
QCheckBox, QRadioButton {{ spacing: 8px; background: transparent; min-height: 24px; }}
QScrollArea {{ border: 0; background: transparent; }}
QScrollArea > QWidget > QWidget {{ background: transparent; }}
QScrollBar:vertical {{ background: transparent; width: 10px; margin: 2px; }}
QScrollBar::handle:vertical {{ background: {t['border_strong']}; border-radius: 4px; min-height: 32px; }}
QScrollBar:horizontal {{ background: transparent; height: 10px; margin: 2px; }}
QScrollBar::handle:horizontal {{ background: {t['border_strong']}; border-radius: 4px; min-width: 32px; }}
QScrollBar::add-line, QScrollBar::sub-line {{ width: 0; height: 0; }}
QTabWidget::pane {{ border: 1px solid {t['border']}; border-radius: {r['m']}px; background: {t['surface']}; top: -1px; }}
QTabBar::tab {{ padding: 8px 14px; background: {t['surface_alt']}; color: {t['text_muted']}; margin: 2px; border-radius: {r['s']}px; }}
QTabBar::tab:selected {{ background: {t['accent_soft']}; color: {t['accent_soft_text']}; }}
QHeaderView::section {{ background: {t['surface_alt']}; color: {t['text_muted']}; border: 0; border-bottom: 1px solid {t['border']}; padding: 7px; }}
QProgressBar {{ background: {t['surface_alt']}; border: 0; border-radius: 5px; height: 10px; text-align: center; color: {t['text']}; }}
QProgressBar::chunk {{ background: {t['accent']}; border-radius: 5px; }}
QStatusBar {{ color: {t['text_muted']}; }}
QMessageBox QLabel {{ color: {t['text']}; }}
""" + (_neon_extras(t) if variant == 'neon' else '')


def _neon_extras(t: dict) -> str:
    """NEON//SYS details on top of the shared rules: neon edges, gradients, display font."""
    m, c, y = t['neon_magenta'], t['neon_cyan'], t['neon_yellow']
    return f"""/* NEON//SYS extras */
QLabel#brand {{ font-family: {NEON_FONT}; font-weight: 900; letter-spacing: 2px; color: {y}; }}
QLabel#heading {{ color: {t['text']}; }}
QFrame#card {{ border: 1px solid {t['border']}; border-top: 2px solid {m}; border-radius: 4px; }}
QPushButton {{ border-radius: 4px; }}
QPushButton:hover {{ border-color: {c}; color: {c}; }}
QPushButton:focus {{ border: 2px solid {y}; }}
QPushButton[variant="primary"] {{ background: {t['accent']}; color: {t['accent_text']}; border: 1px solid {c}; }}
QPushButton[variant="primary"]:hover {{ background: {t['accent_hover']}; color: {t['accent_text']}; }}
QLineEdit:focus, QComboBox:focus, QSpinBox:focus, QDoubleSpinBox:focus {{ border: 2px solid {y}; }}
QTabBar::tab:selected {{ background: {t['surface']}; color: {c}; border-bottom: 2px solid {y}; }}
QProgressBar::chunk {{ background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 {m}, stop:1 {c}); border-radius: 2px; }}
QScrollBar::handle:vertical, QScrollBar::handle:horizontal {{ background: {t['border_strong']}; }}
QScrollBar::handle:vertical:hover, QScrollBar::handle:horizontal:hover {{ background: {m}; }}
QPlainTextEdit, QTextEdit {{ font-family: {NEON_MONO}; }}
"""


def stylesheet(variant: str | None = None) -> str:
    return build_stylesheet(variant or resolve_variant())


def write_qss_files(directory: str | os.PathLike) -> list[Path]:
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True)
    written = []
    for variant in ALL_VARIANTS:
        path = directory / (f'air-{variant}.qss' if variant in VARIANTS else f'{variant}.qss')
        path.write_text(build_stylesheet(variant), encoding='utf-8')
        written.append(path)
    return written

# --------------------------------------------------------------------------
# Geometry helpers (pure)
# --------------------------------------------------------------------------

def parse_size(text: str | None) -> tuple[int, int] | None:
    if not text:
        return None
    m = re.fullmatch(r'\s*(\d{3,5})\s*[xX×]\s*(\d{3,5})\s*', text)
    return (int(m.group(1)), int(m.group(2))) if m else None


def fit_size(desired: tuple[int, int], available: tuple[int, int],
             minimum: tuple[int, int] = (360, 420), fill: float = 0.94) -> tuple[int, int]:
    """Largest size <= desired that fits fill*available, never below minimum
    unless the screen itself is smaller."""
    aw, ah = max(1, int(available[0] * fill)), max(1, int(available[1] * fill))
    w = min(desired[0], aw)
    h = min(desired[1], ah)
    w = max(w, min(minimum[0], aw))
    h = max(h, min(minimum[1], ah))
    return int(w), int(h)


def is_compact(width: int) -> bool:
    return width < BREAKPOINT_COMPACT


def reduced_motion(home=None) -> bool:
    if os.environ.get('NOVA_REDUCED_MOTION', '') in ('1', 'true', 'yes'):
        return True
    base = Path(home) if home else Path.home()
    try:
        text = (base / '.config/kdeglobals').read_text(encoding='utf-8', errors='replace')
    except OSError:
        return False
    factor = _kde_value(text, 'KDE', 'AnimationDurationFactor')
    try:
        return factor is not None and float(factor) == 0.0
    except ValueError:
        return False

# --------------------------------------------------------------------------
# Qt part (imported lazily)
# --------------------------------------------------------------------------

def _qt():
    from PyQt6 import QtCore, QtGui, QtWidgets  # noqa: WPS433 (lazy on purpose)
    return QtCore, QtGui, QtWidgets


def apply_theme(target=None, variant: str | None = None) -> str:
    """Apply the NOVA stylesheet to a widget or the whole application."""
    _, _, QtWidgets = _qt()
    qss = stylesheet(variant)
    target = target or QtWidgets.QApplication.instance()
    if target is not None:
        target.setStyleSheet(qss)
    return qss


def available_size(widget=None) -> tuple[int, int]:
    override = parse_size(os.environ.get('NOVA_SCREEN_OVERRIDE'))
    if override:
        return override
    _, QtGui, QtWidgets = _qt()
    screen = None
    if widget is not None and widget.screen() is not None:
        screen = widget.screen()
    if screen is None:
        screen = QtGui.QGuiApplication.primaryScreen()
    if screen is None:
        return (1366, 768)
    geo = screen.availableGeometry()
    return geo.width(), geo.height()


def setup_window(window, title: str | None = None, size: tuple[int, int] = (1000, 680),
                 minimum: tuple[int, int] = (360, 420), app_id: str | None = None):
    """Theme + fit to screen + centre + standard shortcuts + smoke hook."""
    QtCore, QtGui, QtWidgets = _qt()
    if title:
        window.setWindowTitle(title)
    icon = QtGui.QIcon.fromTheme('nova')
    if not icon.isNull():
        window.setWindowIcon(icon)
    avail = available_size(window)
    w, h = fit_size(size, avail, minimum)
    window.setMinimumSize(min(minimum[0], w), min(minimum[1], h))
    window.resize(w, h)
    screen = window.screen() or QtGui.QGuiApplication.primaryScreen()
    if screen is not None and not os.environ.get('NOVA_SCREEN_OVERRIDE'):
        geo = screen.availableGeometry()
        window.move(geo.x() + max(0, (geo.width() - w) // 2), geo.y() + max(0, (geo.height() - h) // 2))
    window.setStyleSheet(stylesheet())
    close = QtGui.QShortcut(QtGui.QKeySequence('Ctrl+Q'), window)
    close.activated.connect(window.close)
    window._nova_shortcuts = [close]  # keep a reference
    QtCore.QTimer.singleShot(0, lambda: fit_content(window))
    _install_smoke_hook(window, app_id)
    return w, h


def fit_content(window) -> bool:
    """If the central widget needs more room than the window has (small screens,
    large fonts, 200 % scale), put it into a scroll area instead of clipping it."""
    _, _, QtWidgets = _qt()
    central = window.centralWidget() if hasattr(window, 'centralWidget') else None
    if central is None or isinstance(central, QtWidgets.QScrollArea):
        return False
    hint = central.minimumSizeHint()
    if hint.width() <= window.width() and hint.height() <= window.height():
        return False
    scroll = QtWidgets.QScrollArea()
    scroll.setWidgetResizable(True)
    scroll.setFrameShape(QtWidgets.QFrame.Shape.NoFrame)
    window.takeCentralWidget()
    scroll.setWidget(central)
    window.setCentralWidget(scroll)
    return True


def _install_smoke_hook(window, app_id):
    target = os.environ.get('NOVA_UI_SMOKE')
    if not target:
        return
    QtCore, _, QtWidgets = _qt()
    name = app_id or Path(sys.argv[0]).name or 'nova-app'
    out = Path(target)
    out.mkdir(parents=True, exist_ok=True)

    def grab():
        app = QtWidgets.QApplication.instance()
        try:
            window.grab().save(str(out / f'{name}.png'))
            hint = window.minimumSizeHint()
            avail = available_size(window)
            metrics = {
                'app': name,
                'window': [window.width(), window.height()],
                'available': list(avail),
                'minimum_size_hint': [hint.width(), hint.height()],
                'fits_screen': window.width() <= avail[0] and window.height() <= avail[1],
                'content_fits_window': hint.width() <= window.width() and hint.height() <= window.height(),
                'device_pixel_ratio': window.devicePixelRatioF(),
                'variant': resolve_variant(),
                'compact': is_compact(window.width()),
            }
            (out / f'{name}.json').write_text(json.dumps(metrics, ensure_ascii=False, indent=1), encoding='utf-8')
        finally:
            if app is not None:
                app.quit()

    delay = int(os.environ.get('NOVA_UI_SMOKE_DELAY_MS', '1500'))
    QtCore.QTimer.singleShot(delay, grab)


def make_button(text: str, callback=None, variant: str = 'secondary', tooltip: str | None = None):
    _, _, QtWidgets = _qt()
    button = QtWidgets.QPushButton(text)
    if variant != 'secondary':
        button.setProperty('variant', variant)
    if tooltip:
        button.setToolTip(tooltip)
    if callback is not None:
        button.clicked.connect(callback)
    return button


def card(title: str, description: str = ''):
    """Return (frame, layout) of a NOVA card."""
    _, _, QtWidgets = _qt()
    frame = QtWidgets.QFrame()
    frame.setObjectName('card')
    layout = QtWidgets.QVBoxLayout(frame)
    layout.setContentsMargins(SPACING['l'], SPACING['m'] + 2, SPACING['l'], SPACING['l'])
    layout.setSpacing(SPACING['s'])
    heading = QtWidgets.QLabel(title)
    heading.setObjectName('heading')
    heading.setWordWrap(True)
    layout.addWidget(heading)
    if description:
        desc = QtWidgets.QLabel(description)
        desc.setObjectName('description')
        desc.setWordWrap(True)
        layout.addWidget(desc)
    return frame, layout


def header(title: str, subtitle: str = ''):
    _, _, QtWidgets = _qt()
    box = QtWidgets.QWidget()
    layout = QtWidgets.QVBoxLayout(box)
    layout.setContentsMargins(0, 0, 0, SPACING['s'])
    layout.setSpacing(2)
    brand = QtWidgets.QLabel(title)
    brand.setObjectName('brand')
    layout.addWidget(brand)
    if subtitle:
        sub = QtWidgets.QLabel(subtitle)
        sub.setObjectName('description')
        sub.setWordWrap(True)
        layout.addWidget(sub)
    return box


def confirm(parent, title: str, text: str, *, danger: bool = False,
            yes: str = 'Продолжить', no: str = 'Отмена') -> bool:
    """Consistent confirmation dialog. Default button is always the safe one."""
    _, _, QtWidgets = _qt()
    box = QtWidgets.QMessageBox(parent)
    box.setWindowTitle(title)
    box.setText(text)
    box.setIcon(QtWidgets.QMessageBox.Icon.Warning if danger else QtWidgets.QMessageBox.Icon.Question)
    ok = box.addButton(yes, QtWidgets.QMessageBox.ButtonRole.AcceptRole)
    cancel = box.addButton(no, QtWidgets.QMessageBox.ButtonRole.RejectRole)
    if danger:
        ok.setProperty('variant', 'danger')
    box.setDefaultButton(cancel)
    box.setEscapeButton(cancel)
    box.exec()
    return box.clickedButton() is ok


def error(parent, title: str, text: str, details: str | None = None) -> None:
    _, _, QtWidgets = _qt()
    box = QtWidgets.QMessageBox(parent)
    box.setIcon(QtWidgets.QMessageBox.Icon.Critical)
    box.setWindowTitle(title)
    box.setText(text)
    if details:
        box.setDetailedText(details)
    box.exec()


def info(parent, title: str, text: str) -> None:
    _, _, QtWidgets = _qt()
    QtWidgets.QMessageBox.information(parent, title, text)


def scroll_page(intro: str = ''):
    """Scrollable page: returns (scroll_area, layout). Cards are inserted above the stretch."""
    _, _, QtWidgets = _qt()
    scroll = QtWidgets.QScrollArea()
    scroll.setWidgetResizable(True)
    scroll.setFrameShape(QtWidgets.QFrame.Shape.NoFrame)
    body = QtWidgets.QWidget()
    layout = QtWidgets.QVBoxLayout(body)
    layout.setContentsMargins(SPACING['xs'], SPACING['xs'], SPACING['s'], SPACING['l'])
    layout.setSpacing(SPACING['m'])
    if intro:
        label = QtWidgets.QLabel(intro)
        label.setWordWrap(True)
        label.setObjectName('description')
        layout.addWidget(label)
    layout.addStretch(1)
    scroll.setWidget(body)
    return scroll, layout


def add_to_page(layout, widget) -> None:
    """Insert before the trailing stretch created by scroll_page()."""
    layout.insertWidget(max(0, layout.count() - 1), widget)


def fade_in(widget, duration: int = 160) -> None:
    if reduced_motion():
        return
    QtCore, _, QtWidgets = _qt()
    effect = QtWidgets.QGraphicsOpacityEffect(widget)
    widget.setGraphicsEffect(effect)
    anim = QtCore.QPropertyAnimation(effect, b'opacity', widget)
    anim.setDuration(duration)
    anim.setStartValue(0.0)
    anim.setEndValue(1.0)
    anim.setEasingCurve(QtCore.QEasingCurve.Type.OutCubic)
    anim.finished.connect(lambda: widget.setGraphicsEffect(None))
    anim.start()


def busy_indicator(parent=None):
    """Small animated activity indicator (static dots when motion is reduced)."""
    QtCore, QtGui, QtWidgets = _qt()

    class BusyIndicator(QtWidgets.QWidget):
        def __init__(self, parent=None):
            super().__init__(parent)
            self.setFixedSize(22, 22)
            self._angle = 0
            self._timer = QtCore.QTimer(self)
            self._timer.timeout.connect(self._tick)
            self.setVisible(False)
            self.setAccessibleName('Выполняется')

        def start(self):
            self.setVisible(True)
            if not reduced_motion():
                self._timer.start(40)

        def stop(self):
            self._timer.stop()
            self.setVisible(False)

        def _tick(self):
            self._angle = (self._angle + 18) % 360
            self.update()

        def paintEvent(self, _event):  # noqa: N802 (Qt API)
            painter = QtGui.QPainter(self)
            painter.setRenderHint(QtGui.QPainter.RenderHint.Antialiasing)
            color = QtGui.QColor(TOKENS[resolve_variant()]['accent'])
            pen = QtGui.QPen(color, 3)
            pen.setCapStyle(QtCore.Qt.PenCapStyle.RoundCap)
            painter.setPen(pen)
            rect = QtCore.QRectF(3, 3, 16, 16)
            painter.drawArc(rect, int(-self._angle * 16), int(270 * 16))

    return BusyIndicator(parent)


def process_runner(parent, view, busy=None):
    """Run fixed argv lists with QProcess, stream merged output into `view`.
    Never uses a shell. Returns a callable run(argv, on_finished=None)."""
    QtCore, _, _ = _qt()
    jobs = []

    def run(argv, on_finished=None):
        from shutil import which
        if not argv:
            return None
        if not which(argv[0]) and not Path(argv[0]).exists():
            view.setPlainText('Команда не найдена: ' + argv[0])
            return None
        proc = QtCore.QProcess(parent)
        jobs.append(proc)
        proc.setProcessChannelMode(QtCore.QProcess.ProcessChannelMode.MergedChannels)
        view.setPlainText('Выполняется: ' + ' '.join(argv[:3]) + ('…' if len(argv) > 3 else '') + '\n')
        if busy is not None:
            busy.start()

        def read():
            view.insertPlainText(bytes(proc.readAllStandardOutput()).decode('utf-8', 'replace'))

        def done(code, _status):
            view.append(f'\nЗавершено. Код {code}')
            if busy is not None:
                busy.stop()
            if proc in jobs:
                jobs.remove(proc)
            if on_finished:
                on_finished(code)

        proc.readyReadStandardOutput.connect(read)
        proc.finished.connect(done)
        proc.errorOccurred.connect(lambda err: view.append('Ошибка запуска: ' + str(err)))
        proc.start(argv[0], list(argv[1:]))
        return proc

    run.jobs = jobs
    return run


def adaptive_nav(parent=None):
    """Sidebar navigation that turns into a drop-down below BREAKPOINT_COMPACT.

    Returns a widget with: add_page(title, widget), set_filter(text),
    select(index), current_index(), stack, sidebar, combo.
    """
    QtCore, _, QtWidgets = _qt()

    class AdaptiveNav(QtWidgets.QWidget):
        def __init__(self, parent=None):
            super().__init__(parent)
            self.titles = []
            outer = QtWidgets.QVBoxLayout(self)
            outer.setContentsMargins(0, 0, 0, 0)
            outer.setSpacing(SPACING['s'])
            self.combo = QtWidgets.QComboBox()
            self.combo.setAccessibleName('Разделы')
            outer.addWidget(self.combo)
            row = QtWidgets.QHBoxLayout()
            row.setSpacing(SPACING['m'])
            outer.addLayout(row, 1)
            self.sidebar = QtWidgets.QListWidget()
            self.sidebar.setAccessibleName('Разделы')
            self.sidebar.setMinimumWidth(200)
            self.sidebar.setMaximumWidth(260)
            self.sidebar.setSizePolicy(QtWidgets.QSizePolicy.Policy.Preferred,
                                       QtWidgets.QSizePolicy.Policy.Expanding)
            row.addWidget(self.sidebar, 0)
            self.stack = QtWidgets.QStackedWidget()
            row.addWidget(self.stack, 1)
            self.sidebar.currentRowChanged.connect(self._changed)
            self.combo.currentIndexChanged.connect(self._combo_changed)
            self._apply_mode(self.width() or 1000)

        def add_page(self, title, widget):
            self.titles.append(title)
            self.sidebar.addItem(title)
            self.combo.addItem(title)
            self.stack.addWidget(widget)

        def select(self, index):
            if 0 <= index < len(self.titles):
                self.sidebar.setCurrentRow(index)

        def current_index(self):
            return self.stack.currentIndex()

        def set_filter(self, text):
            needle = text.casefold().strip()
            first = None
            for i, title in enumerate(self.titles):
                hidden = bool(needle) and needle not in title.casefold()
                self.sidebar.item(i).setHidden(hidden)
                if not hidden and first is None:
                    first = i
            if needle and first is not None:
                self.select(first)

        def _changed(self, index):
            if index < 0:
                return
            self.stack.setCurrentIndex(index)
            if self.combo.currentIndex() != index:
                self.combo.blockSignals(True)
                self.combo.setCurrentIndex(index)
                self.combo.blockSignals(False)
            fade_in(self.stack.currentWidget())

        def _combo_changed(self, index):
            if index >= 0 and self.sidebar.currentRow() != index:
                self.sidebar.setCurrentRow(index)

        def _apply_mode(self, width):
            compact = is_compact(width)
            self.combo.setVisible(compact)
            self.sidebar.setVisible(not compact)

        def resizeEvent(self, event):  # noqa: N802 (Qt API)
            self._apply_mode(event.size().width())
            super().resizeEvent(event)

    return AdaptiveNav(parent)


def grid_columns(width: int, min_column: int = 300, maximum: int = 3) -> int:
    """How many card columns fit into `width` (pure, unit-tested)."""
    return max(1, min(maximum, width // max(1, min_column)))


def responsive_grid(min_column: int = 300, maximum: int = 3):
    """Container that re-flows child widgets into 1..maximum columns."""
    _, _, QtWidgets = _qt()

    class ResponsiveGrid(QtWidgets.QWidget):
        def __init__(self):
            super().__init__()
            self.items = []
            self.grid = QtWidgets.QGridLayout(self)
            self.grid.setContentsMargins(0, 0, 0, 0)
            self.grid.setSpacing(SPACING['m'])
            self.columns = 0

        def add(self, widget):
            self.items.append(widget)
            self._reflow(self.width() or 900, force=True)

        def _reflow(self, width, force=False):
            columns = grid_columns(width, min_column, maximum)
            if columns == self.columns and not force:
                return
            self.columns = columns
            for widget in self.items:
                self.grid.removeWidget(widget)
            for index, widget in enumerate(self.items):
                self.grid.addWidget(widget, index // columns, index % columns)
            for c in range(maximum):
                self.grid.setColumnStretch(c, 1 if c < columns else 0)

        def resizeEvent(self, event):  # noqa: N802 (Qt API)
            self._reflow(event.size().width())
            super().resizeEvent(event)

    return ResponsiveGrid()


def run_app(factory, app_name: str):
    """Create QApplication, build the main window via factory(), run the loop."""
    _, QtGui, QtWidgets = _qt()
    app = QtWidgets.QApplication.instance() or QtWidgets.QApplication(sys.argv)
    app.setApplicationName(app_name)
    app.setDesktopFileName(app_name.lower().replace(' ', '-'))
    window = factory()
    window.show()
    return app.exec()


if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == '--write-qss':
        for written in write_qss_files(sys.argv[2]):
            print(written)
    else:
        print('usage: nova_ui.py --write-qss DIR')
