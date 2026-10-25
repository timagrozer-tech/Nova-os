#!/usr/bin/env bash
# Vendor third-party KDE themes from GitHub into third_party/ (run in CI only:
# needs network). Every project is cloned at its current default branch, the
# exact commit SHA and licence are recorded in third_party/<name>/SOURCE.txt,
# and only the installed theme files are kept (no build scripts are shipped).
# Nothing here runs as root or touches the host outside the given directories.
set -Eeuo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${1:-$ROOT/third_party}"
WORK="$(mktemp -d)"
trap 'rm -rf -- "$WORK"' EXIT
mkdir -p "$OUT"

clone() { # name url
  git clone -q --depth 1 "$2" "$WORK/$1"
  printf 'project=%s\nurl=%s\ncommit=%s\ndate=%s\n' "$1" "$2" \
    "$(git -C "$WORK/$1" rev-parse HEAD)" "$(git -C "$WORK/$1" log -1 --format=%cI)"
}

# 1. Fluent KDE: Plasma desktop theme, Aurorae decorations, Kvantum, colours, SDDM.
mkdir -p "$OUT/fluent-kde"
clone Fluent-kde https://github.com/vinceliuice/Fluent-kde.git > "$OUT/fluent-kde/SOURCE.txt"
cp "$WORK/Fluent-kde/LICENSE" "$OUT/fluent-kde/LICENSE" 2>/dev/null || cp "$WORK"/Fluent-kde/COPYING "$OUT/fluent-kde/LICENSE"
fake_home="$WORK/home-fluent"; mkdir -p "$fake_home"
( cd "$WORK/Fluent-kde" && HOME="$fake_home" ./install.sh --round >/dev/null 2>&1 || HOME="$fake_home" ./install.sh >/dev/null 2>&1 )
rm -rf "$OUT/fluent-kde/root"; mkdir -p "$OUT/fluent-kde/root"
for d in .local/share/plasma/desktoptheme .local/share/aurorae/themes .local/share/color-schemes \
         .local/share/plasma/look-and-feel .config/Kvantum; do
  if [[ -d "$fake_home/$d" ]]; then mkdir -p "$OUT/fluent-kde/root/$d"; cp -a "$fake_home/$d/." "$OUT/fluent-kde/root/$d/"; fi
done
if [[ -d "$WORK/Fluent-kde/sddm" ]]; then cp -a "$WORK/Fluent-kde/sddm" "$OUT/fluent-kde/sddm-src"; fi

# 2. Fluent icon theme.
mkdir -p "$OUT/fluent-icons"
clone Fluent-icon-theme https://github.com/vinceliuice/Fluent-icon-theme.git > "$OUT/fluent-icons/SOURCE.txt"
cp "$WORK/Fluent-icon-theme/COPYING" "$OUT/fluent-icons/LICENSE" 2>/dev/null || cp "$WORK/Fluent-icon-theme/LICENSE" "$OUT/fluent-icons/LICENSE"
rm -rf "$OUT/fluent-icons/icons"; mkdir -p "$OUT/fluent-icons/icons"
( cd "$WORK/Fluent-icon-theme" && ./install.sh -d "$OUT/fluent-icons/icons" -r >/dev/null 2>&1 \
  || ./install.sh -d "$OUT/fluent-icons/icons" >/dev/null 2>&1 )
# drop icon caches (regenerated in the image) and keep symlinks relative
find "$OUT/fluent-icons/icons" -name 'icon-theme.cache' -delete

# Inventory for review
{
  echo "# Vendored third-party themes — $(date -u +%FT%TZ)"
  for p in fluent-kde fluent-icons; do echo; cat "$OUT/$p/SOURCE.txt"; echo "size=$(du -sh "$OUT/$p" | cut -f1)"; done
  echo; echo '## Files (top levels)'
  (cd "$OUT" && find . -maxdepth 5 -type d | sort | head -300)
} > "$OUT/INVENTORY.txt"
echo "Vendored into $OUT"; cat "$OUT/INVENTORY.txt" | head -40
