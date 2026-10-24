#!/usr/bin/env bash
# Interactive LIVE session of the NOVA ISO in a temporary UEFI VM.
# No host disk/partitions attached. NOVA_TEST_DISK=1 adds an EMPTY virtual disk.
set -Eeuo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$(tr -d '[:space:]' < "$ROOT/VERSION")"
ISO="${1:-$ROOT/output/NOVA-OS-${VERSION}-amd64.iso}"
[[ -f "$ISO" ]] || { echo "ISO not found: $ISO" >&2; exit 1; }
command -v qemu-system-x86_64 >/dev/null || { echo 'Install qemu-system-x86' >&2; exit 1; }
code=''; vars=''
for dir in /usr/share/OVMF /usr/share/ovmf /usr/share/edk2/ovmf; do
  if [[ -f "$dir/OVMF_CODE_4M.fd" && -f "$dir/OVMF_VARS_4M.fd" ]]; then
    code="$dir/OVMF_CODE_4M.fd"; vars="$dir/OVMF_VARS_4M.fd"; break
  fi
  if [[ -f "$dir/OVMF_CODE.fd" && -f "$dir/OVMF_VARS.fd" ]]; then
    code="$dir/OVMF_CODE.fd"; vars="$dir/OVMF_VARS.fd"; break
  fi
done
[[ -n "$code" ]] || { echo 'OVMF firmware missing (install ovmf)' >&2; exit 1; }
tmp="$(mktemp -d)"
trap 'rm -rf -- "$tmp"' EXIT
cp -- "$vars" "$tmp/NOVA_VARS.fd"
accel=tcg; [[ -w /dev/kvm ]] && accel=kvm
# Sound backend on the host: pa (PulseAudio/PipeWire-pulse), pipewire, alsa or none.
extra=()
if [[ "${NOVA_TEST_DISK:-0}" == 1 ]]; then
  disk="$ROOT/output/nova-test-disk-uefi.qcow2"
  [[ -f "$disk" ]] || qemu-img create -f qcow2 "$disk" 30G
  extra+=(-drive "file=$disk,if=virtio,format=qcow2")
  echo "Virtual test disk: $disk (safe to delete)"
fi
echo 'Boot testing in isolated QEMU/UEFI: no internal drives connected.'
qemu-system-x86_64 -machine "q35,accel=$accel" -m 4096 -smp 4 \
  -drive "if=pflash,format=raw,unit=0,readonly=on,file=$code" \
  -drive "if=pflash,format=raw,unit=1,file=$tmp/NOVA_VARS.fd" \
  -device virtio-vga,xres=1920,yres=1080 -device qemu-xhci -device usb-tablet \
  -audiodev "${NOVA_QEMU_AUDIO:-pa},id=snd0" -device ich9-intel-hda -device hda-output,audiodev=snd0 \
  -nic user,model=virtio-net-pci -cdrom "$ISO" -boot d "${extra[@]}"
