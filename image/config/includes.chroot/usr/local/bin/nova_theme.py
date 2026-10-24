#!/usr/bin/env python3
"""Compatibility wrapper (NOVA ≤ 0.11 API). New code should use nova_ui.

User choice lives in ~/.config/nova/theme: auto (follow KDE Plasma), light or dark.
"""
from pathlib import Path

from nova_ui import build_stylesheet, resolve_variant

THEME_ROOT = Path('/usr/share/nova/themes')
CHOICE = Path.home() / '.config/nova/theme'


def load_nova_stylesheet(fallback=''):
    """Return the NOVA Air stylesheet for the current choice.

    The QSS is generated from the shared design tokens in nova_ui, so every
    NOVA application looks the same. `fallback` is kept for API compatibility
    and returned only if generation fails for an unexpected reason.
    """
    try:
        return build_stylesheet(resolve_variant())
    except Exception:  # pragma: no cover - defensive, keeps old apps alive
        for name in ('air-light.qss',):
            try:
                return (THEME_ROOT / name).read_text(encoding='utf-8')
            except OSError:
                pass
        return fallback
