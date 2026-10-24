#!/usr/bin/env python3
"""NOVA Update: read-only preflight, conservative APT plan parser, journal summaries.

No package installation or restoration is performed in this library.
"""
from __future__ import annotations
import os
import json
import re
import shutil
import subprocess
from pathlib import Path

TIMESHIFT_CONFIG=Path('/etc/timeshift/timeshift.json')
HISTORY_ROOT=Path('/var/lib/nova-update-center/history')
SENSITIVE={'grub','grub-efi','shim','linux-image','linux-headers','initramfs','systemd','network-manager','nvidia','dkms','firmware'}

def live_boot(cmdline: str) -> bool:
    return bool(re.search(r'(?:^|\s)boot=live(?:\s|$)',cmdline))

def parse_plan(output: str) -> dict:
    """Parse apt-get -s upgrade output. Fail closed on removals/downgrades.

    Plan is for display only: the elevated helper ALWAYS re-simulates before install.
    """
    upgrades, removals, installs, downgrades = [], [], [], []
    for line in output.splitlines():
        if line.startswith('Inst '):
            bits=line.split()
            if len(bits)>1:
                name=bits[1]
                upgrades.append(name)
                if re.search(r'\[[^]]+\].*\([^)]*\)',line) and re.search(r'\bdowngrad',line,re.I):
                    downgrades.append(name)
        if line.startswith(('Remv ','Purg ')):
            bits=line.split(); removals.append(bits[1] if len(bits)>1 else '?')
        match_new = re.search(r'\b(\d+) newly installed\b', line)
        if match_new and int(match_new.group(1))>0:
            installs.append('new packages')
        if re.search(r'\bdowngraded\b',line,re.I) and not line.startswith('Inst '):
            downgrades.append('downgrade reported')
    flagged=sorted({name for name in upgrades if any(name.startswith(prefix) for prefix in SENSITIVE)})
    # Bad/malformed simulations should never cause a false "safe to upgrade" result.
    has_summary=bool(re.search(r'\b\d+ upgraded,\s*\d+ newly installed,\s*\d+ to remove',output))
    problems=[]
    if not has_summary: problems.append('Не распознан итог APT')
    if removals: problems.append('APT планирует удаление пакетов')
    if installs: problems.append('APT планирует новые пакеты')
    if downgrades: problems.append('APT планирует понижение версий')
    return {'upgrades':upgrades,'removals':removals,'new_packages':installs,
            'downgrades':downgrades,'sensitive':flagged,'problems':problems,'valid':has_summary and not problems}

def formatted_plan(result:dict)->str:
    lines=[f'Запланировано обновить пакетов: {len(result["upgrades"])}']
    if result['upgrades']:
        lines.extend('  • '+n for n in result['upgrades'][:80])
        if len(result['upgrades'])>80: lines.append('  … остальные пакеты не показаны')
    if result['sensitive']:
        lines.append('\nВнимание: системные компоненты, драйверы или ядро:')
        lines.extend('  ! '+n for n in result['sensitive'][:30])
    if result['problems']:
        lines.append('\nОперация блокируется: '+ '; '.join(result['problems']))
    elif not result['upgrades']: lines.append('Доступных обновлений по текущему индексу нет.')
    else: lines.append('\nПеред установкой будет создан снимок Timeshift. Изменения потребуют подтверждения.')
    return '\n'.join(lines)

def run_readonly(argv:list[str],timeout:int=20)->tuple[int,str]:
    try:
        p=subprocess.run(argv,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,
                         encoding='utf-8',errors='replace',timeout=timeout,check=False,stdin=subprocess.DEVNULL)
        return p.returncode,p.stdout[:30000]
    except (OSError,subprocess.TimeoutExpired) as e: return 127,type(e).__name__

def valid_timeshift_config(config_path:Path)->bool:
    """Require meaningful JSON configuration before offering privileged updates."""
    try:
        data=json.loads(config_path.read_text(encoding='utf-8'))
    except (OSError,UnicodeError,ValueError):
        return False
    return (isinstance(data,dict)
            and bool(data.get('backup_device_uuid'))
            and data.get('do_first_run') in (False,'false','False'))

def host_state(cmdline_path:Path=Path('/proc/cmdline'), config_path:Path=TIMESHIFT_CONFIG) ->dict:
    try: live=live_boot(cmdline_path.read_text(encoding='utf-8'))
    except OSError: live=False
    return {'live':live,'timeshift_installed':shutil.which('timeshift') is not None,
            'timeshift_configured':valid_timeshift_config(config_path),
            'root_fs':root_filesystem(),'kernel':os.uname().release,
            'flatpak_available':shutil.which('flatpak') is not None,
            'fwupd_available':shutil.which('fwupdmgr') is not None}

def root_filesystem()->str:
    status,data=run_readonly(['findmnt','-n','-o','FSTYPE','/'],timeout=5)
    return data.strip() if status==0 else 'неизвестно'

def recent_history(root:Path=HISTORY_ROOT)->list[str]:
    if not root.is_dir():return []
    rows=[]
    for path in sorted(root.glob('tx-*'),reverse=True)[:30]:
        if not path.is_dir() or path.is_symlink():continue
        try:status=(path/'status').read_text(encoding='utf-8').strip()
        except OSError:status='неизвестно'
        status={'success':'успешно','failed':'ошибка','blocked':'заблокировано',
                'snapshot_failed':'снимок не создан','running':'выполняется'}.get(status,'неизвестно')
        rows.append(f'{path.name}: {status}')
    return rows


def main(argv:list[str])->int:
    if len(argv)==2 and argv[1]=='--timeshift-check':
        return 0 if valid_timeshift_config(TIMESHIFT_CONFIG) else 4
    if len(argv)==3 and argv[1]=='--check':
        path=Path(argv[2])
        result=parse_plan(path.read_text(encoding='utf-8'))
        print(formatted_plan(result))
        return 0 if result['valid'] else 5
    if len(argv)==3 and argv[1]=='--history':
        for line in recent_history(Path(argv[2])):print(line)
        return 0
    return 2

if __name__=='__main__':
    import sys
    raise SystemExit(main(sys.argv))
