#!/usr/bin/env bash
# NOVA OS: builds a Debian 13 KDE Live ISO. Run on Debian 13 amd64 as root
# (or in the privileged debian:trixie container used by GitHub Actions).
#
# Safety: works only inside ./output of this repository. Never touches disks,
# partitions or files outside the project. Never deletes an existing build
# unless NOVA_REBUILD=1 is set explicitly (then only ./output/work is removed).
set -Eeuo pipefail
export LC_ALL=C
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$(tr -d '[:space:]' < "$ROOT/VERSION")"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+(\.[0-9]+)?$ ]] || { echo "Bad VERSION: $VERSION" >&2; exit 1; }
ISO_NAME="NOVA-OS-${VERSION}-amd64.iso"
OUT="$ROOT/output"
WORK="$OUT/work"
MIN_FREE_GB="${NOVA_MIN_FREE_GB:-25}"

if (( EUID != 0 )); then
  echo 'ERROR: Run as root: sudo bash tools/build-iso.sh' >&2; exit 1
fi
if [[ "$(uname -m)" != "x86_64" ]]; then
  echo 'ERROR: This build profile requires an x86_64 Linux host.' >&2; exit 1
fi
for program in lb debootstrap xorriso mksquashfs apt-ftparchive; do
  command -v "$program" >/dev/null || { echo "Missing $program; run: sudo bash tools/install-build-deps.sh" >&2; exit 1; }
done
mkdir -p "$OUT"
free_gb=$(( $(df --output=avail -k "$OUT" | tail -n 1) / 1024 / 1024 ))
if (( free_gb < MIN_FREE_GB )); then
  echo "ERROR: only ${free_gb} GB free in $OUT, need at least ${MIN_FREE_GB} GB." >&2; exit 1
fi
if [[ -e "$WORK" ]]; then
  if [[ "${NOVA_REBUILD:-0}" == 1 ]]; then
    echo "NOVA_REBUILD=1: cleaning previous build in $WORK"
    (cd "$WORK" && lb clean --purge) || true
    rm -rf --one-file-system -- "$WORK"
  else
    echo "Build directory already exists: $WORK" >&2
    echo 'Inspect it, or rebuild with: sudo NOVA_REBUILD=1 bash tools/build-iso.sh' >&2
    exit 1
  fi
fi
mkdir -p "$WORK"
cd "$WORK"

# Notes on options (verified against live-build 1:20250505 in Debian 13):
#  * grub-pc,grub-efi  – the live-build default for amd64, same GRUB menu for
#    BIOS and UEFI; iso-hybrid image works from DVD and USB (dd/Rufus DD/Ventoy).
#  * --uefi-secure-boot auto – uses Debian's signed shim + GRUB when available.
#  * --firmware-binary false – the /firmware folder is only for debian-installer,
#    which NOVA does not ship (Calamares is used instead); saves space.
#  * Keyboard: US + RU, Alt+Shift switches layout.
lb config \
  --mode debian \
  --distribution trixie \
  --architecture amd64 \
  --binary-images iso-hybrid \
  --archive-areas 'main contrib non-free non-free-firmware' \
  --bootloaders 'grub-pc,grub-efi' \
  --uefi-secure-boot auto \
  --debian-installer none \
  --firmware-chroot true \
  --firmware-binary false \
  --apt-recommends true \
  --security true \
  --updates true \
  --checksums sha256 \
  --bootappend-live 'boot=live components quiet splash locales=ru_RU.UTF-8 keyboard-layouts=us,ru keyboard-options=grp:alt_shift_toggle hostname=nova-live' \
  --iso-application "NOVA OS ${VERSION} Live Installer" \
  --iso-publisher 'NOVA OS community project' \
  --iso-volume "NOVA_OS_${VERSION//./}" \
  --image-name "nova-os-${VERSION}"

# Overlay only customization files; do not alter generated live-build settings.
cp -a "$ROOT/image/config/." "$WORK/config/"
# Single source of truth for the version inside the image.
printf 'NOVA_OS_VERSION=%s\nNOVA_OS_CODENAME=%s\n' "$VERSION" \
  "$(sed -n 's/^NOVA_OS_CODENAME=//p' "$ROOT/image/config/includes.chroot/etc/nova-release")" \
  > "$WORK/config/includes.chroot/etc/nova-release"
find "$WORK/config" -name '__pycache__' -type d -prune -exec rm -rf {} +
find "$WORK/config/hooks/live" -name '*.hook.chroot' -exec chmod 0755 {} +
find "$WORK/config/hooks/live" -name '*.hook.binary' -exec chmod 0755 {} +
find "$WORK/config/includes.chroot/usr/local/bin" "$WORK/config/includes.chroot/usr/local/lib/nova" \
  -maxdepth 1 -type f -exec chmod 0755 {} +

echo "Starting live-build for NOVA OS ${VERSION}. This downloads distribution packages and may use 15-25 GB."
started=$(date -u +%s)
( lb build ) 2>&1 | tee "$OUT/build.log"
finished=$(date -u +%s)

mapfile -d '' images < <(find "$WORK" -maxdepth 1 -type f -name '*.iso' -print0)
if (( ${#images[@]} != 1 )); then
  echo "Expected exactly 1 ISO, found ${#images[@]}. Inspect $OUT/build.log" >&2; exit 1
fi
install -m 0644 "${images[0]}" "$OUT/$ISO_NAME"
(cd "$OUT" && sha256sum "$ISO_NAME" > SHA256SUMS)

# Build manifest: exact Debian package versions inside the live system.
{
  echo "NOVA OS ${VERSION} build manifest"
  echo "built_utc=$(date -u -d "@$finished" +%Y-%m-%dT%H:%M:%SZ)"
  echo "build_minutes=$(( (finished - started) / 60 ))"
  echo "live_build=$(dpkg-query -W -f='${Version}' live-build 2>/dev/null || echo unknown)"
  echo "iso_bytes=$(stat -c %s "$OUT/$ISO_NAME")"
  echo
  echo '# Packages in the live system (name version)'
  if compgen -G "$WORK/*.packages" >/dev/null; then cat "$WORK"/*.packages; fi
} > "$OUT/build-manifest.txt"

ls -lh "$OUT/$ISO_NAME" "$OUT/SHA256SUMS" "$OUT/build-manifest.txt"
echo "Running content verification (tools/verify-iso.sh)…"
bash "$ROOT/tools/verify-iso.sh" "$OUT/$ISO_NAME"
echo 'NEXT: boot-test this ISO (tools/qemu-boot-test.sh) and on the target laptop from USB before installing.'
