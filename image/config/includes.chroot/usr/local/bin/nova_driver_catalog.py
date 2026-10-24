#!/usr/bin/env python3
"""Small, auditable catalog of Debian driver/firmware packages.

Auto-install is restricted to standard Debian packages. Vendor installer
executables, arbitrary URLs and NVIDIA GPU driver versions are NEVER treated
as safe for unattended installation.
"""
from __future__ import annotations

import re
import subprocess
from urllib.parse import urlparse

# This catalog is deliberately small: no systemwide upgrades or proprietary .run.
SAFE_PACKAGES = {
    'firmware-iwlwifi': 'Прошивка Wi‑Fi Intel',
    'firmware-realtek': 'Прошивки Realtek Ethernet/Wi‑Fi',
    'firmware-atheros': 'Прошивки Qualcomm/Atheros Wi‑Fi',
    'firmware-mediatek': 'Прошивки MediaTek Wi‑Fi',
    'firmware-brcm80211': 'Прошивки Broadcom Wi‑Fi',
    'firmware-amd-graphics': 'Прошивки видеокарт AMD',
    'firmware-sof-signed': 'Прошивки звуковых контроллеров Intel SOF',
    'mesa-vulkan-drivers': 'Открытые драйверы Vulkan Mesa (AMD/Intel)',
}

# Static, vendor-controlled pages; user opens these in a browser.
# Never offer to install files downloaded from these sites automatically.
OFFICIAL_VENDOR_URLS = {
    'NVIDIA': 'https://www.nvidia.com/en-us/drivers/',
    'AMD': 'https://www.amd.com/en/support.html',
    'Intel': 'https://www.intel.com/content/www/us/en/download-center/home.html',
    'Debian': 'https://wiki.debian.org/Firmware',
    'LVFS': 'https://fwupd.org/',
}

ALLOWED_APT_HOSTS = {'deb.debian.org', 'security.debian.org'}
PKG_PATTERN = re.compile(r'^[a-z0-9][a-z0-9+.-]{0,80}$')
CANDIDATE_RE = re.compile(r'^\s*Candidate:\s*(\S+)', re.MULTILINE)
VERSION_ROW = re.compile(r'^\s+(?:\*\*\*\s+)?(\S+)\s+\d+\s*$')


def valid_package(pkg: str) -> bool:
    return isinstance(pkg, str) and bool(PKG_PATTERN.fullmatch(pkg)) and pkg in SAFE_PACKAGES


def infer_from_devices(devices: list[dict]) -> list[dict]:
    """Conservative recommendations, not proof that hardware needs a driver."""
    found: dict[str, dict] = {}
    for d in devices:
        name = str(d.get('device', '')).lower()
        kind = str(d.get('type', '')).lower()
        if kind == 'графика':
            if any(x in name for x in ('[1002:', 'advanced micro devices', 'amd/ati', 'radeon')):
                for pkg in ('firmware-amd-graphics', 'mesa-vulkan-drivers'):
                    found[pkg] = {'package': pkg, 'reason': 'Обнаружено видеоустройство AMD'}
            elif any(x in name for x in ('[8086:', 'intel corporation')):
                found['mesa-vulkan-drivers'] = {'package': 'mesa-vulkan-drivers', 'reason': 'Обнаружена графика Intel'}
            # NVIDIA: do not guess a DKMS branch, kernel or MOK/secure-boot state.
        elif kind == 'сеть':
            vendor_pkg = (
                (('[8086:', 'intel corporation'), 'firmware-iwlwifi'),
                (('[10ec:', 'realtek'), 'firmware-realtek'),
                (('[168c:', 'qualcomm', 'atheros'), 'firmware-atheros'),
                (('[14c3:', 'mediatek'), 'firmware-mediatek'),
                (('[14e4:', 'broadcom'), 'firmware-brcm80211'),
            )
            for identifiers, pkg in vendor_pkg:
                if any(x in name for x in identifiers):
                    found[pkg] = {'package': pkg, 'reason': 'Обнаружено сетевое устройство указанного производителя'}
                    break
        elif kind == 'звук' and any(x in name for x in ('intel', '[8086:')):
            found['firmware-sof-signed'] = {'package': 'firmware-sof-signed', 'reason': 'Возможно используется Intel SOF; проверьте работу звука'}
    return [found[k] for k in SAFE_PACKAGES if k in found]


def vendor_pages(devices: list[dict]) -> dict[str, str]:
    name = ' '.join(str(d.get('device', '')).lower() for d in devices)
    result = {'Debian': OFFICIAL_VENDOR_URLS['Debian'], 'LVFS': OFFICIAL_VENDOR_URLS['LVFS']}
    for vendor, needles in (
        ('NVIDIA', ('nvidia', '[10de:')),
        ('AMD', ('[1002:', 'amd/ati', 'advanced micro devices', 'radeon')),
        ('Intel', ('intel corporation', '[8086:')),
    ):
        if any(x in name for x in needles):
            result[vendor] = OFFICIAL_VENDOR_URLS[vendor]
    return result


def policy_candidate(policy: str) -> tuple[str | None, bool]:
    """Accept candidate only if its matching version is served by official Debian.

    If the same version is offered by another server, reject ambiguity. Debian
    signatures are still verified independently by APT during download/install.
    """
    match = CANDIDATE_RE.search(policy)
    if not match or match[1] == '(none)':
        return None, False
    candidate = match[1]
    in_version_table = False
    candidate_rows: list[str] = []
    active = False
    for line in policy.splitlines():
        if 'Version table:' in line:
            in_version_table = True
            continue
        if not in_version_table:
            continue
        row = VERSION_ROW.match(line)
        if row:
            active = row[1] == candidate
        if active:
            candidate_rows.append(line)
    block = '\n'.join(candidate_rows)
    # Require a Debian release marker paired with official download hosts.
    is_debian = bool(re.search(r'\brelease\s+[^\n]*\bo=Debian(?:,|\s|$)', block))
    urls = re.findall(r'https?://[^\s]+', block)
    hosts = {urlparse(u).hostname for u in urls}
    allowed = bool(hosts) and hosts.issubset(ALLOWED_APT_HOSTS)
    return candidate, bool(is_debian and allowed)


def inspect_package(pkg: str, run=subprocess.run) -> dict:
    if not valid_package(pkg):
        return {'package': pkg, 'candidate': None, 'verified': False, 'error': 'Запрещённый пакет'}
    try:
        res = run(['apt-cache', 'policy', pkg], stdout=subprocess.PIPE,
                  stderr=subprocess.PIPE, text=True, timeout=12, check=False)
        if res.returncode:
            return {'package': pkg, 'candidate': None, 'verified': False, 'error': 'APT недоступен'}
        candidate, verified = policy_candidate(res.stdout)
        return {'package': pkg, 'candidate': candidate, 'verified': verified,
                'error': None if verified else 'Нет проверенного кандидата в официальном репозитории Debian'}
    except (OSError, subprocess.TimeoutExpired):
        return {'package': pkg, 'candidate': None, 'verified': False, 'error': 'Ошибка проверки APT'}


def validate_selection(packages: list[str]) -> list[str]:
    if not isinstance(packages, list) or not 1 <= len(packages) <= 8:
        raise ValueError('Выберите от 1 до 8 пакетов')
    if any(not valid_package(p) for p in packages) or len(packages) != len(set(packages)):
        raise ValueError('Выбран недопустимый или повторяющийся пакет')
    return packages
