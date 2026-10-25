#!/usr/bin/env bash
# NOVA OS ISO content verification.
# Proves the ISO is structurally bootable (BIOS + UEFI El Torito, kernel,
# initrd, squashfs) and contains the expected system. It does NOT prove that
# the laptop boots, that drivers work or that installation succeeds — use
# tools/qemu-boot-test.sh and a real USB test for that.
#
# Usage: bash tools/verify-iso.sh [path/to/NOVA-OS-X.Y-amd64.iso]
# Needs: xorriso, unsquashfs (squashfs-tools). Reads only; writes a report to
# output/verify-report.txt and a temporary squashfs copy that is removed.
set -Eeuo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$(tr -d '[:space:]' < "$ROOT/VERSION")"
OUT="$ROOT/output"
ISO="${1:-$OUT/NOVA-OS-${VERSION}-amd64.iso}"
REPORT="$OUT/verify-report.txt"
mkdir -p "$OUT"
[[ -f "$ISO" ]] || { echo "ISO missing: $ISO" >&2; exit 1; }
for tool in xorriso unsquashfs sha256sum; do
  command -v "$tool" >/dev/null || { echo "Install $tool (xorriso / squashfs-tools)." >&2; exit 1; }
done

fail=0; warn=0
: > "$REPORT"
tmp="$(mktemp -d "${TMPDIR:-/tmp}/nova-verify.XXXXXX")"
trap 'rm -rf -- "$tmp"' EXIT
# Read one small file from the ISO (xorriso has no "cat"; extract to a temp file).
iso_file() {
  local name="$1" dest="$tmp/extract.$RANDOM"
  if xorriso -osirrox on -indev "$ISO" -extract "$name" "$dest" >/dev/null 2>&1 && [[ -f "$dest" ]]; then
    cat -- "$dest"; rm -f -- "$dest"
  fi
}
say()  { printf '%s\n' "$*" | tee -a "$REPORT"; }
ok()   { say "PASS  $*"; }
bad()  { say "FAIL  $*"; fail=$((fail+1)); }
note() { say "WARN  $*"; warn=$((warn+1)); }

say "NOVA OS ISO verification — $(basename "$ISO")"
say "size_bytes=$(stat -c %s "$ISO")"

# 1. Checksum (if SHA256SUMS sits next to the ISO)
sums="$(dirname "$ISO")/SHA256SUMS"
if [[ -f "$sums" ]] && grep -q " $(basename "$ISO")\$" "$sums"; then
  if (cd "$(dirname "$ISO")" && grep " $(basename "$ISO")\$" SHA256SUMS | sha256sum --check --status); then
    ok "SHA-256 matches SHA256SUMS"
  else bad "SHA-256 mismatch"; fi
else
  note "no SHA256SUMS entry next to the ISO; sha256=$(sha256sum "$ISO" | cut -d' ' -f1)"
fi

# 2. El Torito boot records: BIOS (platform 0x00) and UEFI (platform 0xef)
eltorito="$(xorriso -indev "$ISO" -report_el_torito plain 2>/dev/null || true)"
printf '%s\n' "$eltorito" >> "$REPORT"
if grep -Eiq 'El Torito boot img.*BIOS' <<<"$eltorito"; then ok "BIOS (Legacy) El Torito boot image present"; else bad "no BIOS El Torito boot image"; fi
if grep -Eiq 'El Torito boot img.*UEFI' <<<"$eltorito"; then ok "UEFI El Torito boot image present"; else bad "no UEFI El Torito boot image"; fi
mbr="$(xorriso -indev "$ISO" -report_system_area plain 2>/dev/null || true)"
if grep -Eiq 'MBR|GPT|isohybrid' <<<"$mbr"; then ok "hybrid system area (USB boot via dd/Rufus DD/Ventoy)"; else note "no hybrid MBR/GPT reported"; fi

# 3. ISO tree
tree="$(xorriso -indev "$ISO" -find / -type f 2>/dev/null | tr -d "'" || true)"
need_path() { if grep -Eq "$1" <<<"$tree"; then ok "$2"; else bad "$2 (missing $1)"; fi; }
need_path '^/live/vmlinuz'                   "live kernel"
need_path '^/live/initrd'                    "live initrd"
need_path '^/live/filesystem\.squashfs$'     "live root filesystem"
need_path '^/boot/grub/grub\.cfg$'           "GRUB menu"
need_path '^/EFI/boot/bootx64\.efi$'         "UEFI loader EFI/boot/bootx64.efi"
if grep -Eq '^/EFI/boot/grubx64\.efi$' <<<"$tree"; then ok "Secure Boot chain (shim -> grubx64.efi)"; else note "no grubx64.efi next to bootx64.efi (Secure Boot may need to be off)"; fi
if grep -Eq '^/pool/.*/grub-pc_.*\.deb$' <<<"$tree" && grep -Eq '^/pool/.*/grub-efi-amd64_.*\.deb$' <<<"$tree" \
   && grep -Eq '^/dists/trixie/main/binary-amd64/Packages' <<<"$tree"; then
  ok "offline GRUB packages + APT indices for Calamares on the medium"
else
  note "offline bootloader pool incomplete: Calamares may need Internet for the GRUB step"
fi

# 4. GRUB boot parameters
grubcfg="$(iso_file /boot/grub/grub.cfg)"
if grep -q 'boot=live' <<<"$grubcfg"; then ok "boot=live in GRUB menu"; else bad "GRUB menu lacks boot=live"; fi
marker="$(iso_file /.disk/nova-offline-bootloader)"
[[ -n "$marker" ]] && say "INFO  pool marker: $marker"
bm="$(iso_file /.disk/nova-bootmenu)"
if [[ "$bm" == applied* ]]; then ok "NOVA boot menu (branded background)"; else note "NOVA boot menu branding not applied (${bm:-no marker}); Debian default menu is used"; fi

# 5. Root filesystem contents
if xorriso -osirrox on -indev "$ISO" -extract /live/filesystem.squashfs "$tmp/fs.squashfs" >/dev/null 2>&1; then
  unsquashfs -l "$tmp/fs.squashfs" 2>/dev/null | sed 's#^squashfs-root##' > "$tmp/list.txt"
  rm -f -- "$tmp/fs.squashfs"
  have() { if grep -Eq "^($1)\$" "$tmp/list.txt"; then ok "$2"; else bad "$2 (missing $1)"; fi; }
  maybe() { if grep -Eq "^($1)\$" "$tmp/list.txt"; then ok "$2"; else note "$2 (missing $1)"; fi; }
  have '/usr/bin/calamares'                         "Calamares installer"
  have '/usr/bin/startplasma-wayland'               "Plasma Wayland session"
  maybe '/usr/bin/startplasma-x11'                  "Plasma X11 fallback session"
  have '/usr/bin/sddm'                              "SDDM login manager"
  have '/usr/sbin/NetworkManager'                   "NetworkManager"
  have '/usr/bin/wireplumber'                       "PipeWire/WirePlumber audio"
  have '/usr/bin/kwin_wayland'                      "KWin Wayland compositor"
  have '/usr/lib/live/config/0030-user-setup|/usr/lib/live/config/0030-live-debconfig_passwd|/usr/lib/live/config/.*user-setup.*' "live-config user setup"
  have '/etc/calamares/settings\.conf'              "Calamares settings"
  maybe '/etc/calamares/branding/nova/branding\.desc' "NOVA Calamares branding"
  have '/usr/share/plasma/look-and-feel/org\.nova\.air\.light\.desktop/metadata\.json' "NOVA Air light look-and-feel"
  have '/usr/share/plasma/look-and-feel/org\.nova\.air\.dark\.desktop/metadata\.json'  "NOVA Air dark look-and-feel"
  have '/usr/share/color-schemes/NovaAirLight\.colors' "NOVA Air light colour scheme"
  have '/usr/share/plasma/look-and-feel/org\.nova\.neon\.desktop/metadata\.json' "NEON//SYS look-and-feel"
  have '/usr/share/plasma/wallpapers/org\.nova\.neon\.wallpaper/contents/ui/main\.qml' "NEON//SYS live wallpaper (QML)"
  have '/usr/share/color-schemes/NovaNeon\.colors'  "NEON//SYS colour scheme"
  maybe '/usr/share/fonts/truetype/nova-neon/Orbitron-Variable\.ttf' "NEON//SYS fonts (Orbitron, Share Tech Mono)"
  maybe '/usr/share/plymouth/themes/nova/nova\.plymouth' "NOVA boot splash (Plymouth)"
  have '/usr/share/plasma/wallpapers/org\.nova\.live\.wallpaper/contents/ui/main\.qml' "NOVA Live wallpaper (QML)"
  have '/usr/local/bin/nova-styles'                 "NOVA Styles and features"
  maybe '/usr/sbin/zramswap'                        "zram-tools (swap in compressed RAM)"
  for app in nova-control nova-personalize nova-layout nova-selftest nova-first-run nova-defender \
             nova-task-manager nova-update-center nova-driver-center nova-android-hub nova-dualboot \
             nova-migration nova-sound-studio nova-gaming nova-phone-hub nova-health nova-performance \
             nova-display nova-hotkeys nova-game-bar nova-key nova-neon nova-neon-center; do
    have "/usr/local/bin/$app" "$app"
  done
  have '/usr/local/bin/nova_ui\.py'                 "NOVA UI kit"
  have '/etc/nova-release'                          "nova-release"
  have '/etc/xdg/kglobalshortcutsrc'                "Windows-like shortcuts defaults"
  have '/usr/bin/kscreen-doctor'                    "kscreen-doctor (refresh rate / monitors)"
  maybe '/usr/bin/ddcutil'                          "ddcutil (external monitor brightness)"
  maybe '/usr/sbin/qemu-ga'                         "QEMU guest agent (CI self-test in VMs)"
  if grep -Eq '^/usr/lib/x86_64-linux-gnu/libreoffice|^/usr/bin/libreoffice' "$tmp/list.txt"; then bad "office suite unexpectedly present"; else ok "no preinstalled office suite"; fi
  if grep -Eq '^/usr/lib/modules/[^/]+/updates/dkms/nvidia' "$tmp/list.txt"; then bad "proprietary NVIDIA module baked into the image"; else ok "no proprietary NVIDIA module in the image"; fi
else
  bad "cannot extract /live/filesystem.squashfs"
fi

size=$(stat -c %s "$ISO")
if (( size > 4294967295 )); then
  note "ISO is larger than 4 GiB: on FAT32 USB sticks use Ventoy with exFAT (default) or Rufus in DD mode"
fi

say "SUMMARY fail=$fail warn=$warn"
say "Checks above inspect the image only; boot/installation/hardware are verified separately."
(( fail == 0 ))
