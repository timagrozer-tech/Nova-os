#!/usr/bin/env bash
# Installs the tools needed to BUILD and BOOT-TEST NOVA OS on Debian 13 (trixie).
# Only official Debian packages; nothing is downloaded from other sources.
set -Eeuo pipefail
if (( EUID != 0 )); then echo 'Run: sudo bash tools/install-build-deps.sh' >&2; exit 1; fi
if [[ "$(. /etc/os-release; echo "${ID}:${VERSION_CODENAME:-unknown}")" != "debian:trixie" ]]; then
  echo 'ERROR: build dependencies are tested for Debian 13 (trixie) only.' >&2
  echo 'On another system use the GitHub Actions workflow or a debian:trixie container.' >&2
  exit 1
fi
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y \
  live-build debootstrap xorriso squashfs-tools dosfstools mtools \
  apt-utils ca-certificates cpio gzip xz-utils zstd \
  grub-pc-bin grub-efi-amd64-bin grub-common \
  qemu-system-x86 qemu-utils ovmf python3
echo "Build dependencies installed: live-build $(dpkg-query -W -f='${Version}' live-build)"
