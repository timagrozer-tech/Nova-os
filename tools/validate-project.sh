#!/usr/bin/env bash
# NOVA OS static validation: syntax, manifests, generated assets, unit tests.
# Runs anywhere with bash + python3 (no root, no network, no KDE needed).
set -Eeuo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
export PYTHONDONTWRITEBYTECODE=1

VERSION="$(tr -d '[:space:]' < VERSION)"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+(\.[0-9]+)?$ ]] || { echo "Bad VERSION: $VERSION" >&2; exit 1; }
grep -qx "NOVA_OS_VERSION=$VERSION" image/config/includes.chroot/etc/nova-release \
  || { echo "etc/nova-release does not match VERSION $VERSION" >&2; exit 1; }

for f in tools/*.sh image/config/hooks/live/*.hook.chroot image/config/includes.chroot/usr/local/lib/nova/* \
         image/config/includes.chroot/usr/local/bin/nova-wallpaper-once; do
  bash -n "$f"
done
for f in image/config/hooks/live/*.hook.binary image/config/hooks/live/*.hook.chroot; do
  sh -n "$f"   # hooks run with /bin/sh (dash) on Debian
done
echo 'Shell syntax OK'

python3 - <<'PY'
from pathlib import Path
root = Path('image/config/includes.chroot/usr/local/bin')
count = 0
for script in sorted(root.iterdir()):
    if not script.is_file():
        continue
    text = script.read_text()
    if script.suffix == '.py' or text.startswith('#!/usr/bin/env python3'):
        compile(text, str(script), 'exec'); count += 1
for script in Path('tools').glob('*.py'):
    compile(script.read_text(), str(script), 'exec'); count += 1
print(f'All {count} Python sources compile')
PY

for desktop in image/config/includes.chroot/usr/share/applications/*.desktop; do
  grep -q '^\[Desktop Entry\]' "$desktop" || { echo "Invalid .desktop: $desktop" >&2; exit 1; }
  grep -q '^Name=' "$desktop" || { echo "No Name= in $desktop" >&2; exit 1; }
  name="$(sed -n 's/^Exec=\([^ ]*\).*$/\1/p' "$desktop" | head -1)"
  if [[ "$name" == /* ]]; then file="image/config/includes.chroot${name}";
  else file="image/config/includes.chroot/usr/local/bin/${name}"; fi
  [[ -f "$file" ]] || { echo "Missing Exec file in $desktop: $name" >&2; exit 1; }
done
echo 'Desktop entries OK'

[[ -f image/config/includes.chroot/usr/share/nova/wallpaper.png ]]
packages=image/config/package-lists/nova.list.chroot
[[ -f "$packages" ]]
if grep -E '^(libreoffice|task-kde-desktop|live-task-kde|kde-standard|spectacle)(\s|$)' "$packages"; then
  echo 'Unwanted/invalid package in manifest (office suite, task meta package, or "spectacle" which is kde-spectacle in Debian 13)' >&2; exit 1
fi
python3 - <<'PY'
from pathlib import Path
def items(path):
    return [p.strip() for p in Path(path).read_text().splitlines() if p.strip() and not p.startswith('#')]
pack = items('image/config/package-lists/nova.list.chroot')
assert len(pack) == len(set(pack)), 'duplicate package'
for name in ['apparmor', 'clamav', 'plasma-systemmonitor', 'python3-psutil', 'wine', 'virt-manager',
             'kde-spectacle', 'qemu-guest-agent', 'live-config-systemd', 'calamares-settings-debian']:
    assert name in pack, name
bios = items('image/config/package-lists/nova-installer-bios.list.binary')
efi = items('image/config/package-lists/nova-installer-efi.list.binary')
assert 'grub-pc' in bios and 'grub-efi-amd64' not in bios, 'BIOS pool list must not contain grub-efi-amd64'
assert 'grub-efi-amd64' in efi and 'grub-pc' not in efi, 'UEFI pool list must not contain grub-pc'
print('Package manifests validated:', len(pack), 'live packages,', len(bios) + len(efi), 'pool packages')
PY

python3 tools/gen-plasma-theme.py --check
python3 - <<'PY'
import sys
sys.path.insert(0, 'image/config/includes.chroot/usr/local/bin')
from pathlib import Path
from nova_ui import build_stylesheet
for v, name in (('light', 'air-light'), ('dark', 'air-dark'), ('neon', 'neon')):
    assert Path(f'image/config/includes.chroot/usr/share/nova/themes/{name}.qss').read_text() == build_stylesheet(v), \
        f'{name}.qss out of date: run python3 image/config/includes.chroot/usr/local/bin/nova_ui.py --write-qss image/config/includes.chroot/usr/share/nova/themes'
print('Generated QSS in sync')
PY

python3 -m unittest discover -s tests
find image/config tools tests -name '__pycache__' -type d -prune -exec rm -rf {} +
echo "Static checks PASSED for NOVA OS $VERSION."
echo 'NOT covered here: ISO build, BIOS/UEFI boot, Calamares install, real hardware (see CHECKLIST_RU.md).'
