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
