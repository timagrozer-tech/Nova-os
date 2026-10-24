#!/usr/bin/env bash
# Automated headless boot test (BIOS and UEFI) with screenshots and in-VM self-test.
# Usage: bash tools/qemu-boot-test.sh [ISO] [bios|uefi|both]
# Results: output/boot-test-<firmware>/{result.json,*.png,selftest.json,...}
set -Eeuo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$(tr -d '[:space:]' < "$ROOT/VERSION")"
ISO="${1:-$ROOT/output/NOVA-OS-${VERSION}-amd64.iso}"
WHICH="${2:-both}"
[[ -f "$ISO" ]] || { echo "ISO not found: $ISO" >&2; exit 1; }
rc=0
for fw in bios uefi; do
  [[ "$WHICH" == both || "$WHICH" == "$fw" ]] || continue
  out="$ROOT/output/boot-test-$fw"
  mkdir -p "$out"
  echo "=== Boot test: $fw ==="
  if python3 "$ROOT/tools/nova_qemu_smoke.py" --iso "$ISO" --firmware "$fw" --out "$out" --resolutions; then
    echo "PASS: $fw"
  else
    echo "FAIL: $fw (see $out/result.json)"; rc=1
  fi
done
exit "$rc"
