#!/usr/bin/env python3
"""Read-only system inventory for NOVA OS 0.7, privacy-filtered when exported.

Hardware checks are informational; no device diagnosis is guaranteed.
No command here asks for root privileges, writes to a device or uses shell=True.
"""
from __future__ import annotations
import re
import shutil
import subprocess
import platform
from datetime import datetime, timezone
from pathlib import Path

COMMANDS = (
    ('Сеть', ['nmcli','-t','-f','DEVICE,TYPE,STATE','device']),
    ('Графика', ['inxi','-Gxx']),
    ('Звук', ['wpctl','status']),
    ('Память', ['free','-h']),
    ('Диски (только чтение)', ['lsblk','-o','NAME,SIZE,TYPE,FSTYPE,MOUNTPOINTS']),
    ('Безопасная загрузка', ['mokutil','--sb-state']),
    ('Видеокарта NVIDIA', ['nvidia-smi','--query-gpu=name,driver_version','--format=csv,noheader']),
    ('Профиль электропитания', ['powerprofilesctl','get']),
)

# Redact private data before sharing. This is best effort, not formal anonymization.
MAC = re.compile(r'(?<![0-9A-Fa-f])(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}(?![0-9A-Fa-f])')
IPV4 = re.compile(r'(?<!\d)(?:\d{1,3}\.){3}\d{1,3}(?!\d)')

def sanitize(text, home=None):
    text = str(text)
    home = str(home) if home is not None else str(Path.home())
    if home and home != '/': text = text.replace(home,'~')
    text = MAC.sub('[MAC скрыт]',text)
    return IPV4.sub('[IP скрыт]',text)

def cmd_result(argv, timeout=7):
    if not shutil.which(argv[0]): return ('недоступно',f'Команда {argv[0]} не установлена')
    try:
        p=subprocess.run(argv, text=True, encoding='utf-8',errors='replace',
                         capture_output=True,timeout=timeout,check=False,stdin=subprocess.DEVNULL)
    except (OSError,subprocess.TimeoutExpired) as exc:
        return ('недоступно',str(exc))
    content=(p.stdout+'\n'+p.stderr).strip()
    if p.returncode != 0: return ('не подтверждено', content[:5000] or 'Команда завершилась с ошибкой')
    return ('информация', content[:5000] or 'Нет данных')

def gather(run=cmd_result):
    """Run only fixed allowlisted read-only commands; caller may mock run."""
    results = [('ОС', 'информация',f'{platform.system()} {platform.release()}  ({platform.machine()})')]
    for label,argv in COMMANDS:
        state,value=run(argv)
        results.append((label,state,value))
    return results

def render_report(rows, private=True, home=None):
    out=['NOVA HEALTH — локальная диагностика',
         'Состояния «информация» НЕ означают, что все драйверы работают.',
         'Не включает автоматическую установку драйверов, изменения разделов или конфигурации.',
         '']
    for label,kind,body in rows:
        body = sanitize(body,home) if private else str(body)
        out.extend((f'== {label} [{kind}] ==',body,''))
    return '\n'.join(out)

def has_live_boot(cmdline=None):
    if cmdline is None:
        try:cmdline=Path('/proc/cmdline').read_text(encoding='utf-8')
        except OSError:return False
    return any(p in ('boot=live','boot=live-config') for p in cmdline.split())
