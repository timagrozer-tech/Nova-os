#!/usr/bin/env python3
"""NOVA Display — pure logic for monitors on KDE Plasma 6 (kscreen-doctor).

Resolution, refresh rate (Hz), scale, rotation, VRR, primary monitor, second
monitor placement and Windows-like projection modes (Win+P: only PC screen,
duplicate, extend, only second screen). Builds argument lists for
`kscreen-doctor`; never runs anything itself. Every change can be reverted
from a snapshot (the GUI reverts automatically after 15 s unless confirmed).
"""
from __future__ import annotations

import json
import re
import time
from pathlib import Path

NAME = re.compile(r'^[A-Za-z0-9._-]{1,40}$')
ROTATION_FROM_KSCREEN = {1: 'normal', 2: 'left', 4: 'inverted', 8: 'right'}
ROTATIONS = {'normal': 'Без поворота', 'left': '90° влево', 'right': '90° вправо', 'inverted': '180°'}
VRR_FROM_KSCREEN = {0: 'never', 1: 'always', 2: 'automatic'}
VRR = {'automatic': 'Автоматически (игры)', 'always': 'Всегда', 'never': 'Выключено'}
SCALES = (1.0, 1.25, 1.5, 1.75, 2.0, 2.25, 2.5, 3.0)
PLACEMENTS = {'right': 'справа', 'left': 'слева', 'above': 'сверху', 'below': 'снизу'}
PROJECT = {
    'pc': 'Только экран компьютера',
    'duplicate': 'Повторяющийся (дублировать)',
    'extend': 'Расширить',
    'second': 'Только второй экран',
}


def _num(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def parse_outputs(text: str) -> list[dict]:
    """Normalise `kscreen-doctor -j` into a list of outputs (connected only)."""
    try:
        data = json.loads(text)
    except ValueError:
        return []
    result = []
    for out in data.get('outputs', []) if isinstance(data, dict) else []:
        if not isinstance(out, dict) or not out.get('connected', True):
            continue
        name = str(out.get('name', ''))
        if not NAME.match(name):
            continue
        modes = []
        for m in out.get('modes', []) or []:
            size = m.get('size') or {}
            w, h = int(size.get('width', 0) or 0), int(size.get('height', 0) or 0)
            if w <= 0 or h <= 0:
                continue
            modes.append({'id': str(m.get('id')), 'width': w, 'height': h,
                          'refresh': round(_num(m.get('refreshRate')), 2)})
        current = next((m for m in modes if m['id'] == str(out.get('currentModeId'))), None)
        pos = out.get('pos') or {}
        result.append({
            'name': name,
            'enabled': bool(out.get('enabled', True)),
            'priority': int(out.get('priority', 0) or 0),
            'scale': round(_num(out.get('scale'), 1.0) or 1.0, 4),
            'rotation': ROTATION_FROM_KSCREEN.get(int(out.get('rotation', 1) or 1), 'normal'),
            'vrr': VRR_FROM_KSCREEN.get(int(out.get('vrrPolicy', 2) or 0), 'automatic'),
            'x': int(pos.get('x', 0) or 0), 'y': int(pos.get('y', 0) or 0),
            'mode_id': current['id'] if current else '',
            'width': current['width'] if current else 0,
            'height': current['height'] if current else 0,
            'refresh': current['refresh'] if current else 0.0,
            'modes': modes,
            'builtin': name.lower().startswith(('edp', 'lvds', 'dsi')),
        })
    result.sort(key=lambda o: (o['priority'] if o['priority'] > 0 else 99, o['name']))
    return result


def resolutions(output: dict) -> list[tuple[int, int]]:
    return sorted({(m['width'], m['height']) for m in output['modes']}, key=lambda s: (s[0] * s[1], s[0]), reverse=True)


def refresh_rates(output: dict, width: int, height: int) -> list[float]:
    return sorted({m['refresh'] for m in output['modes'] if (m['width'], m['height']) == (width, height)}, reverse=True)


def find_mode(output: dict, width: int, height: int, refresh: float | None = None) -> dict | None:
    candidates = [m for m in output['modes'] if (m['width'], m['height']) == (width, height)]
    if not candidates:
        return None
    if refresh is None:
        return max(candidates, key=lambda m: m['refresh'])
    return min(candidates, key=lambda m: abs(m['refresh'] - refresh))


def best_mode(output: dict) -> dict | None:
    """Largest resolution at the highest refresh rate (what Windows recommends)."""
    sizes = resolutions(output)
    return find_mode(output, *sizes[0]) if sizes else None


def hz_label(rate: float) -> str:
    return f'{rate:.2f}'.rstrip('0').rstrip('.') + ' Гц'


def _check_name(name: str) -> str:
    if not NAME.match(name or ''):
        raise ValueError(f'Недопустимое имя монитора: {name!r}')
    return name


def _scale_text(scale: float) -> str:
    if not 0.5 <= scale <= 4.0:
        raise ValueError('Масштаб должен быть от 50 до 400 %')
    return f'{scale:g}'


def logical_size(output: dict, mode: dict | None = None, scale: float | None = None, rotation: str | None = None):
    mode = mode or {'width': output['width'], 'height': output['height']}
    scale = scale or output['scale'] or 1.0
    w, h = mode['width'], mode['height']
    if (rotation or output['rotation']) in ('left', 'right'):
        w, h = h, w
    return int(round(w / scale)), int(round(h / scale))


def mode_args(name: str, mode_id: str) -> list[str]:
    _check_name(name)
    if not re.fullmatch(r'[A-Za-z0-9_.@x-]{1,32}', str(mode_id)):
        raise ValueError('bad mode id')
    return [f'output.{name}.mode.{mode_id}']


def output_args(name: str, *, mode_id: str | None = None, scale: float | None = None, rotation: str | None = None,
                enabled: bool | None = None, x: int | None = None, y: int | None = None,
                priority: int | None = None, vrr: str | None = None) -> list[str]:
    _check_name(name)
    args = []
    if enabled is False:
        return [f'output.{name}.disable']
    if enabled:
        args.append(f'output.{name}.enable')
    if mode_id:
        args += mode_args(name, mode_id)
    if scale is not None:
        args.append(f'output.{name}.scale.{_scale_text(scale)}')
    if rotation is not None:
        if rotation not in ROTATIONS:
            raise ValueError('bad rotation')
        args.append(f'output.{name}.rotation.{rotation}')
    if x is not None and y is not None:
        args.append(f'output.{name}.position.{int(x)},{int(y)}')
    if priority is not None:
        args.append(f'output.{name}.priority.{int(priority)}')
    if vrr is not None:
        if vrr not in VRR:
            raise ValueError('bad vrr policy')
        args.append(f'output.{name}.vrrpolicy.{vrr}')
    return args


def place(primary: dict, second: dict, side: str, second_mode: dict | None = None,
          second_scale: float | None = None) -> tuple[int, int]:
    """Top-left position of `second` next to `primary` (logical pixels)."""
    if side not in PLACEMENTS:
        raise ValueError('bad placement')
    pw, ph = logical_size(primary)
    sw, sh = logical_size(second, second_mode, second_scale)
    if side == 'right':
        return primary['x'] + pw, primary['y']
    if side == 'left':
        return primary['x'] - sw, primary['y']
    if side == 'above':
        return primary['x'], primary['y'] - sh
    return primary['x'], primary['y'] + ph


def normalise_positions(placements: dict[str, tuple[int, int]]) -> dict[str, tuple[int, int]]:
    """KScreen expects the layout to start at 0,0."""
    if not placements:
        return {}
    min_x = min(p[0] for p in placements.values())
    min_y = min(p[1] for p in placements.values())
    return {n: (x - min_x, y - min_y) for n, (x, y) in placements.items()}


def common_mode(a: dict, b: dict) -> tuple[dict, dict] | None:
    shared = set(resolutions(a)) & set(resolutions(b))
    if not shared:
        return None
    w, h = max(shared, key=lambda s: s[0] * s[1])
    return find_mode(a, w, h, 60.0), find_mode(b, w, h, 60.0)


def project_args(outputs: list[dict], mode: str, side: str = 'right') -> list[str]:
    """Windows-like projection (Win+P) for the first two connected outputs."""
    if mode not in PROJECT:
        raise ValueError('bad projection mode')
    if len(outputs) < 2:
        raise ValueError('Подключён только один монитор')
    first = next((o for o in outputs if o['builtin']), outputs[0])
    second = next(o for o in outputs if o is not first)
    if mode == 'pc':
        return output_args(first['name'], enabled=True, priority=1) + [f'output.{second["name"]}.disable']
    if mode == 'second':
        best = best_mode(second)
        return (output_args(second['name'], enabled=True, mode_id=best['id'] if best else None, x=0, y=0, priority=1)
                + [f'output.{first["name"]}.disable'])
    if mode == 'duplicate':
        pair = common_mode(first, second)
        if not pair:
            raise ValueError('У мониторов нет общего разрешения для дублирования')
        ma, mb = pair
        return (output_args(first['name'], enabled=True, mode_id=ma['id'], scale=1.0, x=0, y=0, priority=1)
                + output_args(second['name'], enabled=True, mode_id=mb['id'], scale=1.0, x=0, y=0, priority=2))
    # extend
    best = best_mode(second) or {'id': second['mode_id'], 'width': second['width'], 'height': second['height']}
    sx, sy = place(dict(first, x=0, y=0), second, side, best, second['scale'] or 1.0)
    pos = normalise_positions({first['name']: (0, 0), second['name']: (sx, sy)})
    return (output_args(first['name'], enabled=True, x=pos[first['name']][0], y=pos[first['name']][1], priority=1)
            + output_args(second['name'], enabled=True, mode_id=best['id'], x=pos[second['name']][0],
                          y=pos[second['name']][1], priority=2))


def snapshot_args(outputs: list[dict]) -> list[str]:
    """Arguments that restore exactly the given state (used for revert/profiles)."""
    args = []
    for o in outputs:
        if not o['enabled']:
            args.append(f'output.{_check_name(o["name"])}.disable')
            continue
        args += output_args(o['name'], enabled=True, mode_id=o['mode_id'] or None, scale=o['scale'],
                            rotation=o['rotation'], x=o['x'], y=o['y'],
                            priority=o['priority'] if o['priority'] > 0 else None)
    return args


def describe(o: dict) -> str:
    state = 'включён' if o['enabled'] else 'выключен'
    kind = 'встроенный' if o['builtin'] else 'внешний'
    return (f"{o['name']} ({kind}, {state}): {o['width']}×{o['height']} @ {hz_label(o['refresh'])}, "
            f"масштаб {round(o['scale'] * 100)} %, {ROTATIONS[o['rotation']].lower()}"
            + (', основной' if o['priority'] == 1 else ''))

# ---------------------------------------------------------------------------
# Named profiles ("Дом", "Работа", "Проектор")
# ---------------------------------------------------------------------------

PROFILE_NAME = re.compile(r'^[\w .-]{1,40}$', re.UNICODE)


def profiles_dir(home=None) -> Path:
    return (Path(home) if home else Path.home()) / '.config/nova/display-profiles'


def save_profile(name: str, outputs: list[dict], home=None) -> Path:
    if not PROFILE_NAME.match(name) or name.strip() in ('', '.', '..'):
        raise ValueError('Имя профиля: буквы, цифры, пробел, точка, дефис (до 40 символов)')
    directory = profiles_dir(home)
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / (name.strip() + '.json')
    data = {'saved': time.strftime('%Y-%m-%d %H:%M'), 'outputs': [
        {k: o[k] for k in ('name', 'enabled', 'priority', 'scale', 'rotation', 'x', 'y', 'mode_id',
                           'width', 'height', 'refresh')} for o in outputs]}
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding='utf-8')
    tmp.replace(path)
    return path


def list_profiles(home=None) -> list[str]:
    d = profiles_dir(home)
    return sorted(p.stem for p in d.glob('*.json')) if d.is_dir() else []


def load_profile_args(name: str, current: list[dict], home=None) -> list[str]:
    path = profiles_dir(home) / (name + '.json')
    if not PROFILE_NAME.match(name) or not path.is_file():
        raise ValueError('Профиль не найден')
    data = json.loads(path.read_text(encoding='utf-8'))
    connected = {o['name']: o for o in current}
    saved = [o for o in data.get('outputs', []) if o.get('name') in connected]
    if not saved:
        raise ValueError('Мониторы из профиля сейчас не подключены')
    restored = []
    for o in saved:
        live = connected[o['name']]
        mode = find_mode(live, int(o.get('width', 0)), int(o.get('height', 0)), float(o.get('refresh', 60)))
        restored.append(dict(live, enabled=bool(o.get('enabled', True)), priority=int(o.get('priority', 0)),
                             scale=float(o.get('scale', 1.0)), rotation=o.get('rotation', 'normal')
                             if o.get('rotation') in ROTATIONS else 'normal',
                             x=int(o.get('x', 0)), y=int(o.get('y', 0)),
                             mode_id=mode['id'] if mode else live['mode_id']))
    return snapshot_args(restored)

# ---------------------------------------------------------------------------
# Battery saver: lower refresh rate of the built-in screen on battery (opt-in)
# ---------------------------------------------------------------------------

def power_hz_args(outputs: list[dict], on_battery: bool, battery_hz: float = 60.0) -> list[str]:
    """On battery: built-in screen to the rate closest to battery_hz; on AC: maximum.
    Resolution is never changed; external monitors are never touched."""
    args = []
    for o in outputs:
        if not (o['builtin'] and o['enabled'] and o['width']):
            continue
        rates = refresh_rates(o, o['width'], o['height'])
        if len(rates) < 2:
            continue
        target = min(rates, key=lambda r: abs(r - battery_hz)) if on_battery else rates[0]
        if abs(target - o['refresh']) < 0.5:
            continue
        mode = find_mode(o, o['width'], o['height'], target)
        if mode:
            args += mode_args(o['name'], mode['id'])
    return args


def autostart_entry() -> str:
    return ('[Desktop Entry]\nType=Application\nName=NOVA battery refresh rate\n'
            'Name[ru]=NOVA: частота экрана на батарее\nExec=nova-display watch-power\n'
            'OnlyShowIn=KDE;\nNoDisplay=true\nX-KDE-autostart-phase=2\n')

# ---------------------------------------------------------------------------
# External monitor brightness (DDC/CI via ddcutil)
# ---------------------------------------------------------------------------

def parse_ddc_brightness(text: str) -> int | None:
    m = re.search(r'current value\s*=\s*(\d+),\s*max value\s*=\s*(\d+)', text)
    if not m or int(m.group(2)) == 0:
        return None
    return round(int(m.group(1)) * 100 / int(m.group(2)))


def ddc_set_args(display: int, percent: int) -> list[str]:
    if not 1 <= int(display) <= 16:
        raise ValueError('bad display number')
    percent = max(0, min(100, int(percent)))
    return ['ddcutil', '--display', str(int(display)), 'setvcp', '10', str(percent)]
