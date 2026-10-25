#!/usr/bin/env python3
"""NOVA Living Sky and day/night autopilot — local astronomy, no network.

The user's position is approximated from the time zone (tzdata zone1970.tab
coordinates of the zone's main city), so no location service is needed.
Formulas match the wallpaper's sky.js (tested against each other).
"""
from __future__ import annotations

import math
import os
import re
from datetime import datetime, timezone
from pathlib import Path

ZONE_TAB = Path('/usr/share/zoneinfo/zone1970.tab')
DEFAULT = (55.7558, 37.6176, 'Europe/Moscow')     # used only if the time zone is unknown
RAD = math.pi / 180


def _dms(text: str, deg_digits: int) -> float:
    sign = -1 if text[0] == '-' else 1
    body = text[1:]
    d = int(body[:deg_digits])
    m = int(body[deg_digits:deg_digits + 2])
    s = int(body[deg_digits + 2:deg_digits + 4]) if len(body) > deg_digits + 2 else 0
    return sign * (d + m / 60 + s / 3600)


def parse_coordinates(text: str) -> tuple[float, float]:
    """'+554521+0373704' or '+5651+06036' → (lat, lon)."""
    m = re.fullmatch(r'([+-]\d{4}(?:\d{2})?)([+-]\d{5}(?:\d{2})?)', text)
    if not m:
        raise ValueError(f'bad ISO 6709 coordinates: {text!r}')
    return _dms(m.group(1), 2), _dms(m.group(2), 3)


def current_timezone(etc: str | os.PathLike = '/etc') -> str | None:
    env = os.environ.get('TZ', '').lstrip(':')
    if re.fullmatch(r'[A-Za-z_]+(/[A-Za-z0-9_+\-]+)+', env):
        return env
    etc = Path(etc)
    try:
        link = os.readlink(etc / 'localtime')
        m = re.search(r'zoneinfo/(.+)$', link)
        if m:
            return m.group(1)
    except OSError:
        pass
    try:
        name = (etc / 'timezone').read_text(encoding='utf-8').strip()
        return name or None
    except OSError:
        return None


def location(tz: str | None = None, table: str | os.PathLike = ZONE_TAB) -> tuple[float, float, str]:
    tz = tz or current_timezone()
    try:
        for line in Path(table).read_text(encoding='utf-8').splitlines():
            if line.startswith('#') or not line.strip():
                continue
            parts = line.split('\t')
            if len(parts) >= 3 and parts[2] == tz:
                lat, lon = parse_coordinates(parts[1])
                return round(lat, 4), round(lon, 4), tz
    except (OSError, ValueError):
        pass
    return DEFAULT


def sun_position(when: datetime, lat: float, lon: float) -> dict:
    ms = when.timestamp() * 1000
    d = ms / 86400000 + 2440587.5 - 2451545.0
    g = (357.529 + 0.98560028 * d) % 360
    q = (280.459 + 0.98564736 * d) % 360
    L = q + 1.915 * math.sin(g * RAD) + 0.020 * math.sin(2 * g * RAD)
    e = 23.439 - 0.00000036 * d
    ra = math.atan2(math.cos(e * RAD) * math.sin(L * RAD), math.cos(L * RAD)) / RAD
    dec = math.asin(math.sin(e * RAD) * math.sin(L * RAD)) / RAD
    gmst = (18.697374558 + 24.06570982441908 * d) % 24
    h = ((gmst * 15 + lon - ra) % 360 + 540) % 360 - 180
    alt = math.asin(math.sin(lat * RAD) * math.sin(dec * RAD)
                    + math.cos(lat * RAD) * math.cos(dec * RAD) * math.cos(h * RAD)) / RAD
    az = math.atan2(-math.sin(h * RAD), math.tan(dec * RAD) * math.cos(lat * RAD)
                    - math.sin(lat * RAD) * math.cos(h * RAD)) / RAD
    return {'elevation': alt, 'azimuth': az % 360}


def moon_phase(when: datetime) -> float:
    jd = when.timestamp() / 86400 + 2440587.5
    return ((jd - 2451550.1) / 29.530588853) % 1


def is_day(when: datetime | None = None, lat: float | None = None, lon: float | None = None,
           threshold: float = -3.0) -> bool:
    """Daylight for the autopilot: sun above `threshold` degrees (a little after sunset → dark)."""
    when = when or datetime.now(timezone.utc)
    if lat is None or lon is None:
        lat, lon, _tz = location()
    return sun_position(when, lat, lon)['elevation'] > threshold


def describe(when: datetime | None = None) -> str:
    when = when or datetime.now(timezone.utc)
    lat, lon, tz = location()
    sun = sun_position(when, lat, lon)
    phase = moon_phase(when)
    names = ((0.03, 'новолуние'), (0.22, 'растущий серп'), (0.28, 'первая четверть'), (0.47, 'растущая луна'),
             (0.53, 'полнолуние'), (0.72, 'убывающая луна'), (0.78, 'последняя четверть'), (0.97, 'убывающий серп'),
             (1.01, 'новолуние'))
    moon = next(n for limit, n in names if phase < limit)
    return (f'{tz}: широта {lat:.2f}, долгота {lon:.2f}; Солнце {sun["elevation"]:+.1f}° над горизонтом, '
            f'азимут {sun["azimuth"]:.0f}°; Луна: {moon}')
