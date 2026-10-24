#!/usr/bin/env python3
"""Pure parsing/classification helpers for nova-selftest (unit-tested).

Nothing here runs commands or touches the system; callers pass text in.
"""
from __future__ import annotations

import json
import re

PASS, WARN, FAIL, INFO = 'pass', 'warn', 'fail', 'info'

# Screen matrix used by the UI smoke test. Available area = screen minus a
# 48 px panel, in *logical* pixels (what Qt sees after scaling).
UI_MATRIX = (
    {'id': 'hd-1366x768', 'title': '1366×768 (100 %)', 'available': (1366, 720), 'scale': 1.0},
    {'id': 'fhd-1920x1080', 'title': '1920×1080 (100 %)', 'available': (1920, 1032), 'scale': 1.0},
    {'id': 'qhd-2560x1440-125', 'title': '2560×1440 (125 %)', 'available': (2048, 1104), 'scale': 1.25},
    {'id': 'uhd-3840x2160-200', 'title': '3840×2160 (200 %, HiDPI)', 'available': (1920, 1032), 'scale': 2.0},
)

UI_APPS = (
    'nova-control', 'nova-personalize', 'nova-first-run', 'nova-health', 'nova-task-manager',
    'nova-defender', 'nova-uninstaller', 'nova-update-center', 'nova-driver-center',
    'nova-dualboot', 'nova-migration', 'nova-android-hub', 'nova-sound-studio', 'nova-gaming',
    'nova-gamepad-test', 'nova-phone-hub', 'nova-performance', 'nova-preflight',
    'nova-display', 'nova-hotkeys', 'nova-game-bar',
)


def check(cid: str, title: str, status: str, detail: str = '', **extra) -> dict:
    assert status in (PASS, WARN, FAIL, INFO)
    item = {'id': cid, 'title': title, 'status': status, 'detail': detail.strip()}
    item.update(extra)
    return item


def summarize(checks: list[dict]) -> dict:
    counts = {s: 0 for s in (PASS, WARN, FAIL, INFO)}
    for c in checks:
        counts[c['status']] += 1
    counts['verdict'] = FAIL if counts[FAIL] else (WARN if counts[WARN] else PASS)
    return counts


def cmdline_flags(cmdline: str) -> dict:
    parts = cmdline.split()
    return {
        'live': any(p in ('boot=live', 'boot=live-config') for p in parts),
        'nomodeset': 'nomodeset' in parts,
        'toram': any(p == 'toram' or p.startswith('toram=') for p in parts),
    }


def classify_resolution(width: int, height: int, scale: float = 1.0) -> str:
    if width >= 3840 or height >= 2160:
        base = '4K'
    elif width >= 2560 or height >= 1440:
        base = '2K'
    elif width >= 1920 or height >= 1080:
        base = 'Full HD'
    elif width >= 1366:
        base = 'HD (1366×768)'
    else:
        base = 'ниже HD'
    return base + (f', масштаб {round(scale * 100)} %' if abs(scale - 1.0) > 0.01 else '')


def parse_kscreen_json(text: str) -> list[dict]:
    """Outputs from `kscreen-doctor -j` (Plasma 6). Tolerant to missing keys."""
    try:
        data = json.loads(text)
    except ValueError:
        return []
    result = []
    modes_by_output = {}
    for out in data.get('outputs', []) if isinstance(data, dict) else []:
        if not isinstance(out, dict):
            continue
        modes = {str(m.get('id')): m for m in out.get('modes', []) if isinstance(m, dict)}
        modes_by_output[out.get('name')] = modes
        current = modes.get(str(out.get('currentModeId')), {})
        size = current.get('size') or out.get('size') or {}
        result.append({
            'name': out.get('name', '?'),
            'connected': bool(out.get('connected', True)),
            'enabled': bool(out.get('enabled', True)),
            'width': int(size.get('width', 0) or 0),
            'height': int(size.get('height', 0) or 0),
            'refresh': round(float(current.get('refreshRate', 0) or 0), 1),
            'scale': float(out.get('scale', 1.0) or 1.0),
            'modes': sorted({(int((m.get('size') or {}).get('width', 0)), int((m.get('size') or {}).get('height', 0)))
                             for m in modes.values()}, reverse=True),
            'mode_ids': {f"{(m.get('size') or {}).get('width')}x{(m.get('size') or {}).get('height')}": str(mid)
                         for mid, m in modes.items()},
        })
    return result


GPU_LINE = re.compile(r'^(?P<slot>\S+)\s+(?P<cls>VGA compatible controller|3D controller|Display controller)'
                      r'\s*\[(?P<code>03[0-9a-f]{2})\]:\s*(?P<name>.+?)(?:\s*\[(?P<ids>[0-9a-f]{4}:[0-9a-f]{4})\])?'
                      r'(?:\s*\(rev [0-9a-f]+\))?\s*$', re.I)


PCI_VENDORS = {'8086': 'intel', '10de': 'nvidia', '1002': 'amd', '1022': 'amd',
               '1af4': 'virtual', '1b36': 'virtual', '1234': 'virtual', '15ad': 'virtual', '80ee': 'virtual',
               '1013': 'virtual', '1414': 'virtual'}


def gpu_vendor(name: str, ids: str = '') -> str:
    """Vendor from the PCI vendor ID; word-based fallback (never substrings
    like 'ati' inside 'Corporation')."""
    vendor_id = ids.split(':', 1)[0].lower() if ids else ''
    if vendor_id in PCI_VENDORS:
        return PCI_VENDORS[vendor_id]
    words = set(re.findall(r'[a-z]+', name.lower()))
    if 'nvidia' in words:
        return 'nvidia'
    if words & {'amd', 'ati', 'radeon'}:
        return 'amd'
    if 'intel' in words:
        return 'intel'
    if words & {'virtio', 'qxl', 'vmware', 'bochs', 'cirrus', 'virtualbox'}:
        return 'virtual'
    return 'other'


def parse_lspci_gpus(text: str) -> list[dict]:
    """Parse `lspci -nnk` output into GPU entries with the kernel driver in use."""
    gpus = []
    current = None
    for line in text.splitlines():
        if line and not line[0].isspace():
            m = GPU_LINE.match(line.strip())
            current = None
            if m:
                name = m.group('name')
                ids = m.group('ids') or ''
                current = {'slot': m.group('slot'), 'name': name, 'ids': ids,
                           'vendor': gpu_vendor(name, ids), 'driver': ''}
                gpus.append(current)
        elif current is not None and 'Kernel driver in use:' in line:
            current['driver'] = line.split(':', 1)[1].strip()
    return gpus


def gpu_assessment(gpus: list[dict], nvidia_proc_present: bool = False) -> dict:
    vendors = [g['vendor'] for g in gpus]
    hybrid = 'nvidia' in vendors and any(v in ('intel', 'amd') for v in vendors)
    status, notes = PASS, []
    if not gpus:
        return check('gpu', 'Видеокарта', WARN, 'GPU не обнаружен через lspci')
    for g in gpus:
        if not g['driver']:
            status = WARN
            notes.append(f"{g['name']}: драйвер ядра не загружен")
        if g['vendor'] == 'nvidia' and g['driver'] in ('nouveau', '') and not nvidia_proc_present:
            status = WARN
            notes.append('NVIDIA работает на свободном драйвере nouveau или без драйвера; '
                         'проприетарный драйвер можно поставить через NOVA Driver Center после установки '
                         '(с учётом Secure Boot/MOK)')
    detail = '; '.join(f"{g['vendor']}: {g['name']} [{g['driver'] or 'нет драйвера'}]" for g in gpus)
    if hybrid:
        notes.append('Гибридная графика: рабочий стол идёт на встроенном GPU, игры можно запускать на NVIDIA '
                     '(после установки драйвера — переменные PRIME offload)')
    return check('gpu', 'Видеокарта', status, detail + ('\n' + '\n'.join(notes) if notes else ''),
                 hybrid=hybrid, vendors=vendors)


def parse_wpctl_sinks(text: str) -> list[str]:
    """Return sink names from `wpctl status` (Audio section)."""
    sinks, in_audio, in_sinks = [], False, False
    for raw in text.splitlines():
        line = raw.replace('│', ' ').replace('├', ' ').replace('└', ' ').replace('─', ' ')
        stripped = line.strip()
        if stripped.startswith('Audio'):
            in_audio = True
            continue
        if stripped.startswith(('Video', 'Settings')) and in_audio:
            in_audio = in_sinks = False
        if not in_audio:
            continue
        if stripped.startswith('Sinks:'):
            in_sinks = True
            continue
        if in_sinks and stripped.endswith(':') and not stripped[0:1].isdigit() and not stripped.startswith('*'):
            in_sinks = False
            continue
        if in_sinks and stripped:
            m = re.match(r'^\*?\s*\d+\.\s+(.+?)(?:\s+\[vol:.*\])?$', stripped)
            if m:
                sinks.append(m.group(1).strip())
    return [s for s in sinks if s.lower() != 'dummy output']


def parse_input_devices(text: str) -> dict:
    """Detect touchpad/touchscreen/keyboard from /proc/bus/input/devices."""
    names = re.findall(r'^N: Name="(.*)"$', text, flags=re.M)
    low = [n.lower() for n in names]
    return {
        'touchpad': any('touchpad' in n or 'trackpad' in n for n in low),
        'touchscreen': any('touchscreen' in n or ('touch' in n and 'pad' not in n and 'elan' in n) for n in low),
        'keyboard': any('keyboard' in n for n in low),
        'names': names,
    }


def parse_firmware_errors(journal: str, limit: int = 8) -> list[str]:
    seen = []
    for line in journal.splitlines():
        if re.search(r'(failed to load firmware|firmware: failed to load|Direct firmware load for .* failed)', line, re.I):
            m = re.search(r'(?:firmware(?: load for)?|load firmware)\s+([\w./-]+\.(?:bin|ucode|fw|pnvm|sbin|zst|xz))', line, re.I)
            key = m.group(1) if m else line.strip()[-80:]
            if key not in seen:
                seen.append(key)
        if len(seen) >= limit:
            break
    return seen


def ui_result(metrics: dict | None, png_exists: bool, matrix_id: str, app: str) -> dict:
    """Assess one offscreen UI render."""
    title = f'{app} @ {matrix_id}'
    if not metrics or not png_exists:
        return check(f'ui:{app}:{matrix_id}', title, FAIL, 'окно не отрисовано (ошибка запуска или таймаут)')
    problems = []
    if not metrics.get('fits_screen'):
        problems.append(f"окно {metrics.get('window')} больше экрана {metrics.get('available')}")
    if not metrics.get('content_fits_window'):
        problems.append(f"минимальный размер содержимого {metrics.get('minimum_size_hint')} больше окна {metrics.get('window')}")
    status = WARN if problems else PASS
    return check(f'ui:{app}:{matrix_id}', title, status, '; '.join(problems) or
                 f"окно {metrics.get('window')}, DPR {metrics.get('device_pixel_ratio')}", **{'metrics': metrics})


def render_text(report: dict) -> str:
    marks = {PASS: '✔', WARN: '!', FAIL: '✘', INFO: '·'}
    lines = [f"NOVA self-test — NOVA OS {report.get('version', '?')} — {report.get('host', '')}", '']
    for c in report['checks']:
        lines.append(f"[{marks[c['status']]}] {c['title']}: {c['detail'].splitlines()[0] if c['detail'] else ''}")
        for extra in c['detail'].splitlines()[1:]:
            lines.append('      ' + extra)
    s = report['summary']
    lines += ['', f"Итог: {s['verdict'].upper()} — успешно {s['pass']}, предупреждений {s['warn']}, ошибок {s['fail']}",
              'Самопроверка не заменяет ручную проверку звука, Wi-Fi, сна/пробуждения и установки.']
    return '\n'.join(lines)
