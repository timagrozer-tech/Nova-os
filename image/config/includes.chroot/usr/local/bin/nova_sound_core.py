"""NOVA Sound Studio: safe per-user sound mappings and audio-edit arguments.
No root, no automatic deletion, no shell evaluation.
"""
import json
import os
import re
import shutil
import subprocess
from pathlib import Path

EVENTS = {
    'power.connected': 'Зарядка подключена',
    'power.disconnected': 'Зарядка отключена',
    'nova.started': 'Запуск NOVA-приложения',
    'nova.success': 'Успешная операция NOVA',
    'nova.error': 'Ошибка NOVA',
    'nova.game': 'Запуск игрового режима',
    'nova.phone': 'Подключение телефона через NOVA',
    'nova.import': 'Завершение импорта NOVA',
    'nova.click': 'Действие интерфейса NOVA',
    'nova.warning': 'Предупреждение NOVA',
}
# Only power.* is emitted by the daemon. Other events require an explicit call to nova-play-event.
DEFAULTS = {
    'power.connected': 'connected.wav',
    'power.disconnected': 'disconnected.wav',
    'nova.started': 'welcome.wav',
    'nova.success': 'success.wav',
    'nova.error': 'error.wav',
    'nova.game': 'game.wav',
    'nova.phone': 'phone.wav',
    'nova.import': 'success.wav',
    'nova.click': 'click.wav',
    'nova.warning': 'warning.wav',
}
ACCEPTED = {'.wav', '.ogg', '.mp3', '.flac', '.m4a', '.opus'}
BUNDLED = Path('/usr/share/nova/sounds')

def config_path(home=None):
    return Path(home or Path.home()) / '.config/nova/sounds.json'

def library_path(home=None):
    return Path(home or Path.home()) / '.local/share/nova/sounds'

def load_settings(home=None):
    try:
        data = json.loads(config_path(home).read_text(encoding='utf-8'))
    except (OSError, ValueError, TypeError):
        data = {}
    if not isinstance(data, dict): data = {}
    mapping = data.get('events', {})
    if not isinstance(mapping, dict): mapping = {}
    out = {}
    for key in EVENTS:
        value = mapping.get(key)
        out[key] = value if isinstance(value, str) and len(value) < 4096 else None
    return {'enabled': data.get('enabled', True) is not False,
            'volume': max(0, min(100, int(data.get('volume', 55)))) if str(data.get('volume', 55)).isdigit() else 55,
            'events': out}

def save_settings(settings, home=None):
    path = config_path(home)
    path.parent.mkdir(parents=True, exist_ok=True)
    body = {'enabled': bool(settings.get('enabled', True)),
            'volume': max(0, min(100, int(settings.get('volume', 55)))),
            'events': {k: (settings.get('events', {}).get(k) or '') for k in EVENTS}}
    # World-readable by default could expose private filenames. Restrict to owner.
    temp = path.with_suffix('.tmp')
    with open(temp, 'w', encoding='utf-8') as f:
        os.fchmod(f.fileno(), 0o600)
        json.dump(body, f, indent=2, ensure_ascii=False)
    os.replace(temp, path)

def resolve_sound(event, settings=None, home=None, bundled=None):
    if event not in EVENTS: raise ValueError('Неизвестное событие')
    settings = settings or load_settings(home)
    if not settings['enabled'] or not settings['volume']:
        return None
    assigned = settings['events'].get(event)
    if assigned == 'off': return None
    path = Path(assigned).expanduser() if assigned else (bundled or BUNDLED)/DEFAULTS[event]
    if path.suffix.lower() not in ACCEPTED or not path.is_file(): return None
    return path

def import_sound(source, home=None):
    try:
        source = Path(source).expanduser().resolve(strict=True)
    except OSError as exc:
        raise ValueError('Звуковой файл недоступен') from exc
    if source.suffix.lower() not in ACCEPTED or not source.is_file():
        raise ValueError('Поддерживаются WAV, OGG, MP3, FLAC, M4A и OPUS')
    if source.stat().st_size > 40 * 1024 * 1024:
        raise ValueError('Файл больше 40 МБ. Сначала уменьшите размер.')
    target = library_path(home)
    target.mkdir(parents=True, exist_ok=True)
    # Never overwrite older imports; filenames untrusted, use a generated id.
    import uuid
    dest = target / ('sound-' + uuid.uuid4().hex + source.suffix.lower())
    shutil.copyfile(source, dest)
    return dest

def edit_command(source, destination, start_seconds, duration_seconds, fade_in=0, fade_out=0):
    source, destination = Path(source), Path(destination)
    if source.suffix.lower() not in ACCEPTED or destination.suffix.lower() not in {'.wav', '.ogg'}:
        raise ValueError('Недопустимый формат')
    start, duration = float(start_seconds), float(duration_seconds)
    fin, fout = float(fade_in), float(fade_out)
    if not (0 <= start <= 86400 and 0.1 <= duration <= 3600 and 0 <= fin <= duration and 0 <= fout <= duration):
        raise ValueError('Неверный диапазон или длина плавного перехода')
    if fin+fout > duration: raise ValueError('Сумма переходов длиннее клипа')
    filters=[]
    if fin: filters.append(f'afade=t=in:st=0:d={fin:.3f}')
    if fout: filters.append(f'afade=t=out:st={duration-fout:.3f}:d={fout:.3f}')
    argv=['ffmpeg','-hide_banner','-nostdin','-v','error','-n','-ss',f'{start:.3f}',
          '-i',str(source),'-t',f'{duration:.3f}','-vn']
    if filters: argv += ['-af', ','.join(filters)]
    argv += ['-c:a', 'pcm_s16le' if destination.suffix.lower()=='.wav' else 'libvorbis', str(destination)]
    return argv

def play_sound(path, volume=55):
    if not shutil.which('ffplay'): return False
    try:
        subprocess.Popen(['ffplay','-nodisp','-autoexit','-loglevel','quiet',
                          '-volume',str(max(0,min(100,int(volume)))),str(path)],
                         stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                         start_new_session=True)
        return True
    except OSError: return False

def power_transition(previous_on_battery, current_on_battery):
    if previous_on_battery is None or previous_on_battery == current_on_battery: return None
    return 'power.disconnected' if current_on_battery else 'power.connected'
