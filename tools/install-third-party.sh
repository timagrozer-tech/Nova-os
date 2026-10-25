#!/usr/bin/env bash
# Copy vendored third-party themes (third_party/, see INVENTORY.txt) into an
# image root, together with their licences. Used by build-iso.sh.
# Usage: bash tools/install-third-party.sh <root of includes.chroot>
set -Eeuo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
TP="$ROOT/third_party"
DEST="${1:?usage: install-third-party.sh <image root>}"
[[ -d "$TP" ]] || { echo "No third_party/ — skipping vendored themes"; exit 0; }
copy() { [[ -d "$1" ]] || return 0; mkdir -p "$2"; cp -a "$1/." "$2/"; }
K="$TP/fluent-kde/root"
copy "$K/.local/share/plasma/desktoptheme" "$DEST/usr/share/plasma/desktoptheme"
copy "$K/.local/share/aurorae/themes"      "$DEST/usr/share/aurorae/themes"
copy "$K/.local/share/color-schemes"       "$DEST/usr/share/color-schemes"
copy "$K/.config/Kvantum"                  "$DEST/usr/share/Kvantum"
for lnf in "$K"/.local/share/plasma/look-and-feel/com.github.vinceliuice.*; do
  [[ -d "$lnf" ]] && copy "$lnf" "$DEST/usr/share/plasma/look-and-feel/$(basename "$lnf")"
done
if [[ -d "$TP/fluent-kde/sddm-src/Fluent-6.0" ]]; then
  ours="$DEST/usr/share/sddm/themes/Fluent/theme.conf.user"
  saved=""; [[ -f "$ours" ]] && saved="$(cat "$ours")"
  copy "$TP/fluent-kde/sddm-src/Fluent-6.0" "$DEST/usr/share/sddm/themes/Fluent"
  [[ -n "$saved" ]] && printf '%s\n' "$saved" > "$ours"     # keep NOVA's background settings
fi
copy "$TP/fluent-icons/icons" "$DEST/usr/share/icons"
for p in "$TP"/*/; do
  name="$(basename "$p")"; mkdir -p "$DEST/usr/share/doc/nova-third-party/$name"
  cp "$p/LICENSE" "$p/SOURCE.txt" "$DEST/usr/share/doc/nova-third-party/$name/" 2>/dev/null || true
done
echo "Third-party themes installed into $DEST"
