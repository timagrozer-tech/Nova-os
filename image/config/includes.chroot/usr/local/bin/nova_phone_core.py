"""Validated Android Debug Bridge operations; no shell invocations."""
import ipaddress
import re
from pathlib import Path

def valid_endpoint(s):
    value=s.strip()
    host,sep,port=value.rpartition(':')
    if not sep or not host or not port.isdecimal():
        raise ValueError('Формат адреса: 192.168.1.10:37123')
    try: ipaddress.ip_address(host)
    except ValueError as exc: raise ValueError('Введите цифровой IP-адрес локального устройства') from exc
    if not 1<=int(port)<=65535: raise ValueError('Порт вне диапазона')
    return value

def pairing_command(endpoint,code):
    valid_endpoint(endpoint)
    if not re.fullmatch(r'\d{6}',code): raise ValueError('Требуется шестизначный код сопряжения')
    # Pairing code must be sent via stdin, not exposed in process command line.
    return ['adb','pair',endpoint.strip()]

def connection_command(endpoint):
    return ['adb','connect',valid_endpoint(endpoint)]

def parse_adb_devices(text):
    out=[]
    for line in text.splitlines():
        if not line.strip() or line.startswith('List of devices attached'): continue
        bits=line.split()
        if len(bits)<2: continue
        serial,state=bits[0],bits[1]
        if not re.fullmatch(r'[A-Za-z0-9_.:\-]+',serial):continue
        if state in ('device','unauthorized','offline'):
            out.append((serial,state))
    return out

QUALITY = {
    'economy': ('--max-size=1024', '--max-fps=30', '--video-bit-rate=2M'),
    'balanced': ('--max-size=1600', '--max-fps=60', '--video-bit-rate=6M'),
    'quality': ('--max-size=2560', '--max-fps=60', '--video-bit-rate=12M'),
}

def validate_record_target(target):
    path = Path(target).expanduser()
    # scrcpy's recording can overwrite a file in some versions. Enforce no-clobber.
    if not path.is_absolute() or path.suffix.lower() not in ('.mp4', '.mkv'):
        raise ValueError('Запись должна быть абсолютным путём .mp4 или .mkv')
    if not path.parent.is_dir() or path.exists() or path.is_symlink():
        raise ValueError('Выберите новый файл в существующей папке (без перезаписи).')
    return path

def mirror_command(serial, mode='screen', quality='balanced', record=None):
    if not re.fullmatch(r'[A-Za-z0-9_.:\-]+',serial): raise ValueError('Недопустимый ID телефона')
    if quality not in QUALITY: raise ValueError('Недопустимый профиль качества')
    cmd=['scrcpy','--serial',serial,*QUALITY[quality]]
    if record is not None:
        cmd.append('--record='+str(validate_record_target(record)))
    if mode=='desktop': cmd += ['--new-display=1920x1080']
    elif mode!='screen': raise ValueError('Неизвестный режим')
    return cmd
