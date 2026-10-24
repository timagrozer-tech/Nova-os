#!/usr/bin/env python3
"""NOVA OS: conservative GPU driver preflight (read-only).

No automatic Nvidia installation, repository modification, MOK enrollment,
module signing or Secure Boot changes. This module never executes a shell.
"""
from __future__ import annotations

import platform
import re
import shutil
import subprocess
from pathlib import Path
from typing import Callable

COMMANDS = {
    'secure_boot': ('mokutil', '--sb-state'),
    'pci': ('lspci', '-nnk'),
    'nvidia_driver': ('nvidia-smi', '--query-gpu=driver_version', '--format=csv,noheader'),
    'loaded_modules': ('lsmod',),
    'nvidia_module': ('modinfo', '-F', 'signer', 'nvidia'),
    'nvidia_module_path': ('modinfo', '-n', 'nvidia'),
    'dkms': ('dkms', 'status'),
    'nvidia_apt': ('apt-cache', 'policy', 'nvidia-driver'),
    'nvidia_open_apt': ('apt-cache', 'policy', 'nvidia-open-kernel-dkms'),
}


def run_command(argv: tuple[str, ...], timeout: int = 8) -> tuple[bool, str]:
    if not shutil.which(argv[0]):
        return False, ''
    try:
        proc = subprocess.run(argv, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                              stderr=subprocess.DEVNULL, check=False, timeout=timeout,
                              text=True, encoding='utf-8', errors='replace')
        return proc.returncode == 0, proc.stdout[:12000]
    except (OSError, subprocess.TimeoutExpired):
        return False, ''


def parse_secure_boot(ok: bool, output: str) -> str:
    if not ok:
        return 'unknown'
    lower = output.lower()
    if 'secureboot enabled' in lower:
        return 'enabled'
    if 'secureboot disabled' in lower:
        return 'disabled'
    return 'unknown'


def parse_apt_candidate(output: str) -> str | None:
    match = re.search(r'^\s*Candidate:\s*([^\s]+)', output, re.M)
    return match[1][:90] if match and match[1] != '(none)' else None


def gpu_vendors(pci_output: str) -> list[str]:
    found = set()
    for row in pci_output.splitlines():
        line = row.lower()
        if not any(tag in line for tag in ('vga compatible controller', '3d controller', 'display controller')):
            continue
        if 'nvidia' in line or '[10de:' in line: found.add('NVIDIA')
        if 'advanced micro devices' in line or 'radeon' in line or '[1002:' in line: found.add('AMD')
        if 'intel' in line or '[8086:' in line: found.add('Intel')
    return [vendor for vendor in ('Intel', 'AMD', 'NVIDIA') if vendor in found]


def assess(snapshot: dict) -> dict:
    """Pure decision engine; a detected GPU never authorizes an install."""
    vendors = snapshot.get('gpu_vendors', [])
    has_nv = 'NVIDIA' in vendors
    secure = snapshot.get('secure_boot', 'unknown')
    signed = bool(snapshot.get('module_signer'))
    module = bool(snapshot.get('nvidia_module_present'))
    driver = snapshot.get('nvidia_version')
    headers = bool(snapshot.get('kernel_headers'))
    dkms = snapshot.get('dkms_nvidia', 'unknown')
    warnings: list[str] = []
    if not vendors:
        warnings.append('Видеокарта не обнаружена либо список PCI недоступен. Проверьте оборудование вручную.')
    if has_nv:
        warnings.append('NVIDIA: автоматическая установка драйверов заблокирована до проверки модели GPU и поддерживаемой ветки.')
        if secure == 'enabled' and (not module or not signed):
            warnings.append('Secure Boot включён: NVIDIA DKMS может потребовать доверенную подпись модуля и настройку MOK.')
        elif secure == 'enabled' and signed:
            warnings.append('У модуля есть подпись, но доверие ключу через MOK и возможность загрузки ещё не подтверждены.')
        elif secure == 'unknown':
            warnings.append('Secure Boot не определён: состояние необходимо проверить перед установкой NVIDIA.')
        if not headers:
            warnings.append('Не найдены заголовки для текущего ядра: сборка DKMS может не выполниться.')
        if 'failed' in dkms.lower() or 'added' in dkms.lower():
            warnings.append('DKMS NVIDIA не подтверждён как установленный: проверьте сборку модуля для ядра.')
        if driver and not module:
            warnings.append('nvidia-smi отвечает, но модуль ядра не подтверждён: нужна дополнительная диагностика.')
    if secure == 'unknown' and not has_nv:
        warnings.append('Статус Secure Boot не определён.')
    warnings.append('Перед изменениями: резервная копия, сохранённый доступ к Windows, рабочая загрузочная флешка NOVA.')
    return {'manual_review_required': has_nv or not vendors,
            'automatic_nvidia_allowed': False,
            'nvidia_driver_loaded': bool(snapshot.get('nvidia_module_loaded') and driver),
            'warnings': warnings}


def scan(runner: Callable = run_command, kernel: str | None = None,
         modules_root: Path = Path('/lib/modules')) -> dict:
    kernel = kernel or platform.release()
    probes = {name: runner(cmd) for name, cmd in COMMANDS.items()}
    pci_ok, pci = probes['pci']
    nv_apt_ok, nv_apt = probes['nvidia_apt']
    open_ok, open_apt = probes['nvidia_open_apt']
    _, dkms_raw = probes['dkms']
    _, module_signer = probes['nvidia_module']
    present, mod_path = probes['nvidia_module_path']
    _, smi = probes['nvidia_driver']
    _, loaded_modules = probes['loaded_modules']
    match = re.search(r'\b\d{3,4}\.\d+(?:\.\d+)?\b', smi)
    snapshot = {
        'kernel': kernel[:140],
        'gpu_vendors': gpu_vendors(pci) if pci_ok else [],
        'secure_boot': parse_secure_boot(*probes['secure_boot']),
        'kernel_headers': (modules_root / kernel / 'build').exists(),
        'nvidia_version': match[0] if match else None,
        'nvidia_module_present': bool(present and mod_path.strip()),
        'nvidia_module_loaded': any(re.match(r'^nvidia\s', line) for line in loaded_modules.splitlines()),
        'module_signer': module_signer.strip()[:140] or None,
        'dkms_nvidia': ('installed' if any('nvidia' in x.lower() and ': installed' in x.lower() for x in dkms_raw.splitlines())
                        else 'not verified'),
        'debian_nvidia_candidate': parse_apt_candidate(nv_apt) if nv_apt_ok else None,
        'debian_open_candidate': parse_apt_candidate(open_apt) if open_ok else None,
    }
    snapshot.update(assess(snapshot))
    return snapshot


def format_gpu_report(snapshot: dict) -> str:
    secure = {'enabled': 'включён', 'disabled': 'выключен', 'unknown': 'не определён'}
    return '\n'.join([
        'NOVA GPU SAFETY · только чтение',
        f"Ядро: {snapshot['kernel']}",
        f"GPU: {', '.join(snapshot['gpu_vendors']) or 'не определён'}",
        f"Secure Boot: {secure.get(snapshot['secure_boot'], 'не определён')}",
        f"Заголовки ядра: {'найдены' if snapshot['kernel_headers'] else 'не найдены'}",
        f"Версия драйвера NVIDIA: {snapshot['nvidia_version'] or 'не обнаружена'}",
        f"Модуль NVIDIA доступен: {'да' if snapshot['nvidia_module_present'] else 'не подтверждён'}",
        f"Модуль NVIDIA загружен: {'да' if snapshot.get('nvidia_module_loaded') else 'нет данных'}",
        f"Подпись модуля: {snapshot['module_signer'] or 'не подтверждена'}",
        f"DKMS NVIDIA: {snapshot['dkms_nvidia']}",
        f"Кандидат Debian nvidia-driver: {snapshot['debian_nvidia_candidate'] or 'отсутствует'}",
        f"Кандидат Debian nvidia-open-kernel-dkms: {snapshot['debian_open_candidate'] or 'отсутствует'}",
        '', 'ПРЕДУПРЕЖДЕНИЯ:',
        *('• ' + item for item in snapshot['warnings']),
        '', 'Установка/переподписание модулей NVIDIA, переключение GPU и MOK здесь не выполняются.'
    ])
