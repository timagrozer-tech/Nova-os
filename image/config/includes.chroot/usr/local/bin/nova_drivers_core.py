#!/usr/bin/env python3
"""NOVA Driver Center: bounded, non-privileged, read-only hardware inspection.

Reports exclude raw journal contents, SSIDs, serial numbers, MACs, IPs, and
account details. A detected module never proves the physical device works.
No network calls, firmware writes, driver installation or disk changes.
"""
from __future__ import annotations

import json
import re
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path

# Every command is a literal, bounded argument vector. Never pass user text to shell.
COMMANDS = {
    'pci': ['lspci', '-nnk'],
    'network': ['nmcli', '-t', '-f', 'DEVICE,TYPE,STATE', 'device'],
    'audio': ['wpctl', 'status'],
    'bluetooth': ['rfkill', 'list', 'bluetooth'],
    'secure_boot': ['mokutil', '--sb-state'],
    'dkms': ['dkms', 'status'],
    'nvidia': ['nvidia-smi', '--query-gpu=name,driver_version', '--format=csv,noheader'],
    'logs': ['journalctl', '-b', '-p', 'err', '--no-pager', '--output=cat', '-n', '80'],
}
CATEGORIES = (
    ('Графика', ('vga compatible controller', '3d controller', 'display controller')),
    ('Сеть', ('network controller', 'ethernet controller')),
    ('Звук', ('audio device', 'multimedia audio controller')),
    ('USB', ('usb controller',)),
)
ERROR_CATEGORIES = {
    'Прошивки и firmware': ('firmware', 'ucode', 'microcode'),
    'Видео и GPU': ('nvidia', 'amdgpu', 'i915', 'drm:', 'nouveau'),
    'Звук': ('pipewire', 'wireplumber', 'snd_', 'alsa', 'sof-audio'),
    'Сеть и Wi-Fi': ('wifi', 'wi-fi', 'iwlwifi', 'wlan', 'networkmanager', 'bluetooth'),
    'Накопители': ('i/o error', 'nvme', 'ata error', 'blk_update_request'),
}
PCI_HEADER = re.compile(r'^\s*[0-9a-fA-F]{2,8}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}\.[0-7]\s+(.+)$|^\s*[0-9a-fA-F]{2,8}:[0-9a-fA-F]{2}\.[0-7]\s+(.+)$')


def run_fixed(argv, timeout=6):
    """Return (ok, output) with bounded data, even on missing tools/timeouts."""
    if not shutil.which(argv[0]):
        return False, 'Команда недоступна'
    try:
        result = subprocess.run(argv, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE, text=True, encoding='utf-8',
                                errors='replace', timeout=timeout, check=False)
        out = result.stdout[:30000]
        return result.returncode == 0, out
    except (OSError, subprocess.TimeoutExpired):
        return False, 'Не удалось получить данные'


def category_of(label):
    label = label.lower()
    for category, needles in CATEGORIES:
        if any(x in label for x in needles):
            return category
    return None


def parse_pci(raw):
    """Extract only device type, vendor/model and loaded driver, never raw PCI logs."""
    results = []
    current = None
    for line in raw.splitlines():
        header = PCI_HEADER.match(line)
        if header:
            desc = next((g for g in header.groups() if g), '')
            category = category_of(desc)
            current = None
            if category:
                # Trim extra revision text, device bus address was discarded.
                current = {'type': category, 'device': desc[:220], 'driver': None}
                results.append(current)
        elif current and 'Kernel driver in use:' in line:
            driver = line.partition('Kernel driver in use:')[2].strip()
            if re.fullmatch(r'[a-zA-Z0-9_-]{1,80}', driver):
                current['driver'] = driver
    return results[:80]


def parse_network(raw):
    status = {'wi-fi': 'не обнаружен', 'ethernet': 'не обнаружен'}
    for line in raw.splitlines():
        # Device names / SSIDs are deliberately not copied into reports.
        parts = line.rsplit(':', 2)
        if len(parts) != 3:
            continue
        _, type_, state = parts
        kind = type_.strip().lower()
        if kind in ('wifi', 'wi-fi'):
            kind = 'wi-fi'
        elif kind in ('ethernet',):
            kind = 'ethernet'
        else:
            continue
        value = state.strip().lower()
        if 'connected' in value and 'disconnected' not in value:
            status[kind] = 'подключён'
        elif status[kind] != 'подключён':
            status[kind] = 'обнаружен, не подключён'
    return status


def parse_error_summary(raw):
    # Counts are clues, not clinical-style diagnoses; do not export raw logs.
    counts = {k: 0 for k in ERROR_CATEGORIES}
    lines = [l.lower() for l in raw.splitlines() if l.strip()]
    for line in lines:
        for label, keywords in ERROR_CATEGORIES.items():
            if any(keyword in line for keyword in keywords):
                counts[label] += 1
    return {'errors_sampled': len(lines), 'groups': {k: v for k, v in counts.items() if v}}


def battery_status(root=Path('/sys/class/power_supply')):
    batteries = []
    try:
        candidates = list(root.iterdir())
    except OSError:
        return []
    for item in candidates[:32]:
        try:
            if (item / 'type').read_text().strip().lower() != 'battery':
                continue
            raw_capacity = (item / 'capacity').read_text().strip()
            capacity = int(raw_capacity) if raw_capacity.isdigit() else None
            if capacity is not None and not 0 <= capacity <= 100:
                capacity = None
            status = (item / 'status').read_text().strip().lower()
            status = status if status in ('charging', 'discharging', 'full', 'not charging', 'unknown') else 'unknown'
            batteries.append({'charge_percent': capacity, 'status': status})
        except (ValueError, OSError):
            continue
    return batteries


def summarize(results, power_root=Path('/sys/class/power_supply')):
    pci_ok, pci_raw = results['pci']
    devices = parse_pci(pci_raw) if pci_ok else []
    net_ok, net_raw = results['network']
    network = parse_network(net_raw) if net_ok else {'wi-fi': 'не проверен', 'ethernet': 'не проверен'}
    audio_ok, audio_raw = results['audio']
    bt_ok, bt_raw = results['bluetooth']
    secure_ok, secure_raw = results['secure_boot']
    dkms_ok, dkms_raw = results['dkms']
    nvidia_ok, nvidia_raw = results['nvidia']
    logs_ok, logs_raw = results['logs']
    secure = 'не определён'
    if secure_ok:
        if 'secureboot enabled' in secure_raw.lower(): secure = 'включён'
        elif 'secureboot disabled' in secure_raw.lower(): secure = 'отключён'
    nvidia_version = None
    if nvidia_ok and nvidia_raw.strip():
        # Keep version only; avoid GPU serials or extra driver output.
        versions = re.findall(r'\b\d{3,4}\.\d+(?:\.\d+)?\b', nvidia_raw)
        nvidia_version = versions[0] if versions else 'запущен, версия не определена'
    dkms_modules = []
    if dkms_ok:
        for line in dkms_raw.splitlines()[:40]:
            module = line.split('/', 1)[0].strip()
            if re.fullmatch(r'[a-zA-Z0-9_-]{1,40}', module):
                dkms_modules.append({'name': module, 'built': ': installed' in line})
    report = {
        'schema': 'nova.hardware.v1',
        'generated_utc': datetime.now(timezone.utc).isoformat(timespec='seconds'),
        'notice': 'Только инвентаризация: работа устройств не подтверждена. Исходные логи не экспортируются.',
        'pci_available': pci_ok, 'devices': devices,
        'network': network,
        'audio': 'служба отвечает; проверьте динамики и микрофон' if audio_ok and 'Audio' in audio_raw else 'не подтверждено',
        'bluetooth': ('адаптер обнаружен' if bt_ok and bt_raw.strip() else 'не подтверждено'),
        'secure_boot': secure,
        'nvidia_driver': nvidia_version or 'не подтверждено',
        'dkms_modules': dkms_modules,
        'battery': battery_status(power_root),
        'boot_errors': parse_error_summary(logs_raw) if logs_ok else {'errors_sampled': None, 'groups': {}},
    }
    return report


def advice(report):
    items = []
    devices = report['devices']
    gpu = [d for d in devices if d['type'] == 'Графика']
    if not report['pci_available']:
        items.append('Не удалось выполнить lspci: инвентаризация видеокарты и PCI-устройств неполная.')
    if not gpu:
        items.append('GPU не обнаружен в отчёте PCI: проверьте изображение, разрешение и подключение внешнего монитора вручную.')
    elif any(not d['driver'] for d in gpu):
        items.append('Для одного из GPU не определён загруженный модуль ядра: потребуется ручная проверка.')
    if any('nvidia' in d['device'].lower() for d in gpu):
        items.append('NVIDIA: сопоставьте модель GPU, версию ядра, официальные пакеты Debian и Secure Boot. Не устанавливайте NVIDIA автоматически без проверки версии ядра, Secure Boot и поддержки GPU.')
    if report['network']['wi-fi'] != 'подключён':
        items.append('Wi-Fi: подключитесь к сети и проверьте реальный выход в интернет, скорость и переподключение после сна.')
    if report['audio'] == 'не подтверждено':
        items.append('Звук: проверьте PipeWire/WirePlumber и воспроизведение через динамики, наушники и микрофон.')
    if report['secure_boot'] == 'не определён':
        items.append('Secure Boot: статус не определён, особенно важно проверить его перед использованием NVIDIA DKMS.')
    if report['boot_errors']['groups']:
        items.append('В журнале загрузки найдены сообщения, связанные с оборудованием. Просмотрите их локально; счётчики не доказывают неисправность.')
    items.append('Прошивки BIOS/UEFI: смотрите доступные обновления через KDE Discover или fwupd; никаких автоматических прошивок.')
    items.append('Перед заменой или уменьшением разделов Windows: резервная копия, ключ BitLocker, отключённый Fast Startup, проверка Live USB.')
    return items


def collect(runner=run_fixed, power_root=Path('/sys/class/power_supply')):
    results = {name: runner(argv) for name, argv in COMMANDS.items()}
    report = summarize(results, power_root)
    report['recommendations'] = advice(report)
    return report


def export_report(report, destination):
    """Write privacy-filtered report only to path explicitly selected by the user."""
    target = Path(destination).expanduser()
    if target.is_symlink() or (target.exists() and not target.is_file()):
        raise ValueError('Выберите обычный файл, а не символическую ссылку или каталог')
    # Use schema whitelist so future raw diagnostic fields cannot leak accidentally.
    allowed = ('schema','generated_utc','notice','pci_available','devices','network','audio',
               'bluetooth','secure_boot','nvidia_driver','dkms_modules','battery',
               'boot_errors','recommendations')
    out = {key: report[key] for key in allowed}
    if target.exists():
        raise FileExistsError('Файл уже существует; выберите новое имя')
    with target.open('x', encoding='utf-8') as stream:
        json.dump(out, stream, indent=2, ensure_ascii=False)
        stream.write('\n')
    target.chmod(0o600)
    return target


def format_report(report):
    lines = ['NOVA DRIVER CENTER · Hardware & Driver Audit',
             'Обнаружение оборудования ≠ подтверждение работы драйверов', '']
    for device in report['devices']:
        lines.append(f"{device['type']}: {device['device']}\n    Драйвер ядра: {device['driver'] or 'не определён'}")
    lines.append('\nWi-Fi: '+report['network']['wi-fi'])
    lines.append('Ethernet: '+report['network']['ethernet'])
    lines.append('Аудио: '+report['audio'])
    lines.append('Bluetooth: '+report['bluetooth'])
    lines.append('Secure Boot: '+report['secure_boot'])
    lines.append('NVIDIA (nvidia-smi): '+report['nvidia_driver'])
    lines.append('Батарея: '+('; '.join(f"{b['charge_percent']}% ({b['status']})" for b in report['battery']) if report['battery'] else 'не найдена'))
    log = report['boot_errors']
    lines.append(f"Ошибок в образце журнала: {log['errors_sampled'] if log['errors_sampled'] is not None else 'журнал недоступен'}")
    for key, number in log['groups'].items():
        lines.append(f'  {key}: {number}')
    lines.append('\nРЕКОМЕНДАЦИИ (проверять вручную):')
    lines.extend('• '+recommendation for recommendation in report['recommendations'])
    return '\n'.join(lines)
