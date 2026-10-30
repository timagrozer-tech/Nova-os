#!/usr/bin/env bash
# Сборка образа DroidVM OS (ARM64) из релиза LineageOS for QEMU (jqssun/android-lineage-qemu):
#   1. скачать UTM-пакет arm64 и последний Magisk;
#   2. вынуть boot-раздел из диска vda, вшить Magisk и функции DroidVM OS, записать обратно;
#   3. упаковать vda/vdb/efi_vars + описание ВМ в droidvm-os-arm64.zip.
# Требует: gh (GH_TOKEN), qemu-img, sgdisk, unzip, zip, python3.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
OUT=${OUT:-$PWD/out}
W=${WORK:-$PWD/work}
BASE_REPO=${BASE_REPO:-jqssun/android-lineage-qemu}
mkdir -p "$OUT" "$W"
cd "$W"

echo "== базовая прошивка"
BASE_TAG=${BASE_TAG:-$(gh release view -R "$BASE_REPO" --json tagName -q .tagName)}
echo "релиз $BASE_REPO $BASE_TAG"
gh release view -R "$BASE_REPO" "$BASE_TAG" --json assets -q '.assets[] | "\(.name)  \(.size)"'
UTM=$(gh release view -R "$BASE_REPO" "$BASE_TAG" --json assets -q '.assets[].name' | grep -E '^UTM-VM.*arm64' | head -1)
[ -n "$UTM" ] || { echo "нет UTM-VM arm64 в релизе"; exit 1; }
[ -f "$UTM" ] || gh release download -R "$BASE_REPO" "$BASE_TAG" -p "$UTM" --clobber
rm -rf utm && mkdir utm && unzip -q "$UTM" -d utm
find utm -maxdepth 4 | head -40
DATA=$(dirname "$(find utm -name vda.qcow2 | head -1)")
[ -f "$DATA/vda.qcow2" ] || { echo "нет vda.qcow2"; exit 1; }
PLIST=$(find utm -name config.plist | head -1 || true)
[ -n "$PLIST" ] && { echo "--- config.plist (фрагмент)"; grep -vE '^\s*$' "$PLIST" | head -150; }

echo "== Magisk"
MV=${MAGISK_TAG:-$(gh release view -R topjohnwu/Magisk --json tagName -q .tagName)}
[ -f Magisk.apk ] || gh release download -R topjohnwu/Magisk "$MV" -p "Magisk-$MV.apk" -O Magisk.apk --clobber
echo "Magisk $MV"

echo "== диск vda"
qemu-img info "$DATA/vda.qcow2"
qemu-img convert -O raw "$DATA/vda.qcow2" vda.raw
sgdisk -p vda.raw
PART=$(sgdisk -p vda.raw | awk '$7=="boot" || $7=="boot_a" {print $1; exit}')
[ -n "$PART" ] || { echo "в GPT нет раздела boot"; exit 1; }
read -r FIRST LAST < <(sgdisk -i "$PART" vda.raw | awk '/First sector/{f=$3} /Last sector/{l=$3} END{print f, l}')
SECT=512
PSIZE=$(( (LAST - FIRST + 1) * SECT ))
echo "раздел boot #$PART: сектора $FIRST..$LAST, $PSIZE байт"
dd if=vda.raw of=stock_boot.img bs=$SECT skip="$FIRST" count=$(( LAST - FIRST + 1 )) status=none
# убрать нули в конце, чтобы magiskboot видел исходный размер образа
python3 - <<'PY'
d=open('stock_boot.img','rb').read()
import struct
assert d[:8]==b'ANDROID!', 'в разделе boot нет Android boot image'
open('stock_boot.img','wb').write(d.rstrip(b'\0') if False else d)
PY

echo "== патч"
APPS=()
for a in "$HERE"/apps/*.apk; do [ -f "$a" ] && APPS+=("$a"); done
BOOT_PARTITION_SIZE=$PSIZE DROIDVM_VERSION="${VERSION:-dev}" "$HERE/patch-boot.sh" stock_boot.img Magisk.apk droidvm_boot.img "${APPS[@]}"
NEW=$(stat -c %s droidvm_boot.img)
[ "$NEW" -le "$PSIZE" ] || { echo "новый boot ($NEW) больше раздела ($PSIZE)"; exit 1; }
dd if=/dev/zero of=vda.raw bs=$SECT seek="$FIRST" count=$(( LAST - FIRST + 1 )) conv=notrunc status=none
dd if=droidvm_boot.img of=vda.raw bs=$SECT seek="$FIRST" conv=notrunc status=none
cp droidvm_boot.img "$OUT/droidvm_boot_arm64.img"

echo "== microG: подмена подписи и приложения"
rm -rf payload && mkdir -p payload/lib64 payload/apps
SUPER=$(sgdisk -p vda.raw | awk '$7=="super" {print $1; exit}')
read -r SF SL < <(sgdisk -i "$SUPER" vda.raw | awk '/First sector/{f=$3} /Last sector/{l=$3} END{print f, l}')
dd if=vda.raw of=super.img bs=$SECT skip="$SF" count=$(( SL - SF + 1 )) status=none
python3 "$HERE/lpextract.py" super.img system system.img
rm -f super.img
LIB=system/lib64/libandroid_servers.so
if python3 - <<'PY'
import sys; d=open('system.img','rb'); d.seek(1024); sys.exit(0 if d.read(4)==bytes.fromhex('e2e1f5e0') else 1)
PY
then
  echo "system: EROFS"
  rm -rf sysx && mkdir sysx
  fsck.erofs --extract=sysx system.img >/dev/null
  cp "sysx/$LIB" orig_servers.so
  rm -rf sysx
else
  echo "system: ext4"
  debugfs -R "dump /$LIB orig_servers.so" system.img
fi
rm -f system.img
python3 "$HERE/patch_servers.py" orig_servers.so payload/lib64/libandroid_servers.so
sha256sum orig_servers.so | cut -d' ' -f1 > payload/lib64/orig.sha256
python3 "$HERE/fetch_apps.py" payload/apps
for a in "$HERE"/apps/*.apk; do [ -f "$a" ] && cp "$a" payload/apps/; done
du -sh payload; ls -la payload/apps

echo "== раздел droidvm в свободном месте диска"
PSZ_MB=$(( $(du -sm payload | cut -f1) + 32 ))
truncate -s "${PSZ_MB}M" droidvm.ext4
mke2fs -q -t ext4 -L droidvm -d payload droidvm.ext4
LASTEND=$(sgdisk -p vda.raw | awk '$1 ~ /^[0-9]+$/ && NF>=7 {if ($3>m) m=$3} END{print m}')
START=$(( (LASTEND + 1 + 2047) / 2048 * 2048 ))
sgdisk -n 0:$START:+${PSZ_MB}M -c 0:droidvm -t 0:8300 vda.raw
NEWP=$(sgdisk -p vda.raw | awk '$7=="droidvm" {print $1; exit}')
DF=$(sgdisk -i "$NEWP" vda.raw | awk '/First sector/{print $3}')
dd if=droidvm.ext4 of=vda.raw bs=$SECT seek="$DF" conv=notrunc status=none
sgdisk -v vda.raw | tail -2
sgdisk -p vda.raw | tail -4

echo "== тихая загрузка (без текста ядра на экране)"
EFIP=$(sgdisk -p vda.raw | awk '$7=="EFI" {print $1; exit}')
if [ -n "$EFIP" ]; then
  read -r EF EL < <(sgdisk -i "$EFIP" vda.raw | awk '/First sector/{f=$3} /Last sector/{l=$3} END{print f, l}')
  dd if=vda.raw of=efi.img bs=$SECT skip="$EF" count=$(( EL - EF + 1 )) status=none
  mdir -/ -i efi.img :: 2>/dev/null | head -60 || true
  CHANGED=0
  for cfgf in $(mdir -/ -b -i efi.img :: 2>/dev/null | grep -iE '\.cfg$'); do
    mcopy -o -i efi.img "$cfgf" cfg.tmp
    echo "--- $cfgf"; grep -nE '^\s*(linux|menuentry|set default|set timeout)' cfg.tmp | head -20 || true
    if grep -qE '^\s*linux' cfg.tmp && ! grep -q 'droidvm-quiet' cfg.tmp; then
      sed -i -E '/^\s*linux/ s/$/ quiet loglevel=3 vt.global_cursor_default=0 droidvm-quiet/' cfg.tmp
      sed -i -E 's/^(\s*set timeout=).*/\10/' cfg.tmp
      mcopy -o -i efi.img cfg.tmp "$cfgf"; CHANGED=1
      grep -nE '^\s*linux' cfg.tmp | head -5
    fi
  done
  if [ "$CHANGED" = 1 ]; then
    dd if=efi.img of=vda.raw bs=$SECT seek="$EF" conv=notrunc status=none
    echo "загрузчик: включена тихая загрузка"
  else
    echo "загрузчик: конфиг GRUB с командой linux не найден — оставлено как есть"
  fi
  rm -f efi.img cfg.tmp
fi

echo "== упаковка"
rm -rf pkg && mkdir pkg
qemu-img convert -c -O qcow2 vda.raw pkg/vda.qcow2
rm -f vda.raw
cp "$DATA/vdb.qcow2" pkg/vdb.qcow2 2>/dev/null || true
EFI=$(find utm -name efi_vars.fd | head -1 || true)
[ -n "$EFI" ] && cp "$EFI" pkg/efi_vars.fd
cat > pkg/droidvm-os.json <<JSON
{
  "name": "DroidVM OS",
  "version": "${VERSION:-dev}",
  "base": "LineageOS for QEMU $BASE_TAG",
  "magisk": "$MV",
  "arch": "aarch64",
  "ramMb": 3072,
  "disks": ["vda.qcow2", "vdb.qcow2"],
  "efiVars": "efi_vars.fd"
}
JSON
ls -la pkg
(cd pkg && zip -0 -q "$OUT/droidvm-os-arm64.zip" *)
ls -la "$OUT"
echo "BASE_TAG=$BASE_TAG" > "$OUT/info.txt"; echo "MAGISK=$MV" >> "$OUT/info.txt"
