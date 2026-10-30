#!/usr/bin/env bash
# Офлайн-патч boot.img: Magisk (root) + функции DroidVM OS.
# Использование: patch-boot.sh <stock_boot.img> <Magisk.apk> <out.img> [доп. APK...]
# Если места в образе не хватает, лишние APK отбрасываются (в конце списка — менее важные).
set -euo pipefail
BOOT=$(realpath "$1"); MAGISK=$(realpath "$2"); OUT=$(realpath -m "$3"); shift 3
EXTRA=(); for a in "$@"; do EXTRA+=("$(realpath "$a")"); done
HERE=$(cd "$(dirname "$0")" && pwd)
LIMIT=${BOOT_PARTITION_SIZE:-0}
VERSION=${DROIDVM_VERSION:-dev}
W=$(mktemp -d); trap 'rm -rf "$W"' EXIT
cd "$W"
unzip -qo "$MAGISK" lib/x86_64/libmagiskboot.so 'lib/arm64-v8a/*'
cp lib/x86_64/libmagiskboot.so magiskboot; chmod +x magiskboot
cp lib/arm64-v8a/libmagiskinit.so magiskinit
cp lib/arm64-v8a/libmagisk.so magisk
cp lib/arm64-v8a/libinit-ld.so init-ld
sed "s/@DROIDVM_VERSION@/$VERSION/" "$HERE/overlay/droidvm-pfd.sh" > droidvm-pfd.sh
cp "$HERE/overlay/droidvm-boot.sh" "$HERE/overlay/droidvm.rc" .

build() { # $1 = сколько доп. APK включить
  rm -rf b && mkdir b && cd b
  ../magiskboot unpack "$BOOT" >/dev/null 2>&1
  [ -f ramdisk.cpio ] || { echo "нет ramdisk.cpio в boot.img"; exit 1; }
  ../magiskboot cpio ramdisk.cpio test || { echo "boot.img уже пропатчен — нужен оригинальный"; exit 1; }
  SHA1=$(../magiskboot sha1 "$BOOT")
  cp ramdisk.cpio ramdisk.cpio.orig
  ../magiskboot compress=xz ../magisk magisk.xz >/dev/null
  ../magiskboot compress=xz ../init-ld init-ld.xz >/dev/null
  printf 'KEEPVERITY=true\nKEEPFORCEENCRYPT=true\nRECOVERYMODE=false\nVENDORBOOT=false\nSHA1=%s\n' "$SHA1" > config
  local cmds=(
    "add 0750 init ../magiskinit"
    "mkdir 0750 overlay.d" "mkdir 0750 overlay.d/sbin"
    "add 0644 overlay.d/sbin/magisk.xz magisk.xz"
    "add 0644 overlay.d/sbin/init-ld.xz init-ld.xz"
    "add 0644 overlay.d/droidvm.rc ../droidvm.rc"
    "add 0755 overlay.d/sbin/droidvm-pfd.sh ../droidvm-pfd.sh"
    "add 0755 overlay.d/sbin/droidvm-boot.sh ../droidvm-boot.sh"
  )
  local i=0
  for a in "${EXTRA[@]:0:$1}"; do
    i=$((i+1)); cmds+=("add 0644 overlay.d/sbin/droidvm-app-$i.apk $a")
  done
  cmds+=("patch" "backup ramdisk.cpio.orig" "mkdir 000 .backup" "add 000 .backup/.magisk config")
  KEEPVERITY=true KEEPFORCEENCRYPT=true ../magiskboot cpio ramdisk.cpio "${cmds[@]}"
  ../magiskboot repack "$BOOT" new.img >/dev/null 2>&1
  SIZE=$(stat -c %s new.img)
  cd ..
}

n=${#EXTRA[@]}
while true; do
  build "$n"
  if [ "$LIMIT" -le 0 ] || [ "$SIZE" -le "$LIMIT" ]; then break; fi
  echo "образ $SIZE байт > раздела $LIMIT — убираю одно приложение"
  [ "$n" -gt 0 ] || { echo "даже без приложений образ не помещается"; exit 1; }
  n=$((n-1))
done
cp b/new.img "$OUT"
echo "boot пропатчен: $SIZE байт, приложений внутри: $n${EXTRA:+ из ${#EXTRA[@]}}"
