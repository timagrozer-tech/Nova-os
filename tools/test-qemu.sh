#!/usr/bin/env bash
# Interactive LIVE session of the NOVA ISO in QEMU (BIOS/Legacy firmware).
# No host disks are attached. Optional: NOVA_TEST_DISK=1 adds an EMPTY 30G
# qcow2 *virtual* disk (created in ./output) to try Calamares safely.
set -Eeuo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$(tr -d '[:space:]' < "$ROOT/VERSION")"
ISO="${1:-$ROOT/output/NOVA-OS-${VERSION}-amd64.iso}"
if [[ ! -f "$ISO" ]]; then echo "ISO not found: $ISO" >&2; exit 1; fi
if ! command -v qemu-system-x86_64 >/dev/null; then echo 'Install qemu-system-x86' >&2; exit 1; fi
accel=tcg; [[ -w /dev/kvm ]] && accel=kvm
# Sound backend on the host: pa (PulseAudio/PipeWire-pulse), pipewire, alsa or none.
extra=()
if [[ "${NOVA_TEST_DISK:-0}" == 1 ]]; then
  disk="$ROOT/output/nova-test-disk-bios.qcow2"
  [[ -f "$disk" ]] || qemu-img create -f qcow2 "$disk" 30G
  extra+=(-drive "file=$disk,if=virtio,format=qcow2")
  echo "Virtual test disk: $disk (safe to delete)"
fi
exec qemu-system-x86_64 -machine "q35,accel=$accel" -m 4096 -smp 4 \
  -device virtio-vga,xres=1920,yres=1080 -device qemu-xhci -device usb-tablet \
  -audiodev "${NOVA_QEMU_AUDIO:-pa},id=snd0" -device ich9-intel-hda -device hda-output,audiodev=snd0 \
  -nic user,model=virtio-net-pci -cdrom "$ISO" -boot d "${extra[@]}"
