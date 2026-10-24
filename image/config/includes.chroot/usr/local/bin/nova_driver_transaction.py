#!/usr/bin/env python3
"""Safe APT simulation inspection and root-owned installation journals.

Never claims to create filesystem snapshots or a full driver rollback.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

CRITICAL_PREFIXES = (
    'linux-image', 'linux-headers', 'linux-base', 'initramfs-tools',
    'grub-', 'shim-', 'systemd', 'network-manager', 'plasma-',
    'sddm', 'nvidia-', 'cuda-', 'dkms', 'firmware-misc-nonfree',
)


def inspect_apt_simulation(text: str) -> list[str]:
    issues = []
    if not any(line.startswith('Inst ') for line in text.splitlines()):
        issues.append('APT не планирует установку новых пакетов: требуется ручная проверка')
    for line in text.splitlines():
        if line.startswith(('Remv ', 'Purg ')):
            issues.append('План содержит удаление: ' + line[:150])
        elif line.startswith('Inst '):
            name = line.split(maxsplit=2)[1].lower() if len(line.split()) > 1 else ''
            if name.startswith(CRITICAL_PREFIXES):
                issues.append('Изменение критического пакета: ' + name)
        elif re.search(r'^\s*(?:\d+\s+)?(?:downgraded|not upgraded)', line, re.I):
            issues.append('APT сообщил о возможных откатах/неполных обновлениях')
    return issues[:30]


def summarize_history(root: Path) -> list[str]:
    """History status only. Never returns package versions, account data or raw logs."""
    if not root.is_dir():
        return []
    rows = []
    for entry in sorted(root.glob('tx-*'), reverse=True)[:25]:
        if not entry.is_dir() or entry.is_symlink():
            continue
        status = 'не завершено'
        try:
            val = (entry / 'status').read_text(encoding='utf-8').strip()
            if val == 'success': status = 'успешно'
            elif val == 'failed': status = 'ошибка'
            elif val == 'blocked': status = 'заблокировано'
        except OSError:
            pass
        rows.append(f'{entry.name}: {status}')
    return rows


def main(argv: list[str]) -> int:
    if len(argv) >= 2 and argv[1] == 'check-plan' and len(argv) == 3:
        plan = Path(argv[2]).read_text(encoding='utf-8')
        issues = inspect_apt_simulation(plan)
        for line in issues:
            print('ЗАБЛОКИРОВАНО: ' + line, file=sys.stderr)
        return 5 if issues else 0
    if len(argv) == 3 and argv[1] == 'history':
        for line in summarize_history(Path(argv[2])):
            print(line)
        return 0
    return 2


if __name__ == '__main__':
    raise SystemExit(main(sys.argv))
