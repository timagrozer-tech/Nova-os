#!/usr/bin/env bash
# Render NOVA's original wallpapers (procedural, no third-party images) into
# Plasma wallpaper packages. Needs Node.js + Playwright Chromium + Python Pillow.
# Usage: bash tools/gen-wallpapers.sh
set -Eeuo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$ROOT/image/config/includes.chroot/usr/share/wallpapers"
TMP="$(mktemp -d)"; trap 'rm -rf -- "$TMP"' EXIT
export NODE_PATH="${NODE_PATH:-$(npm root -g)}"
# package  scene  seed  title  title_ru
while IFS='|' read -r pkg scene seed title title_ru; do
  [[ -z "$pkg" || "$pkg" == \#* ]] && continue
  node "$ROOT/tools/wallpapers/render.js" "$ROOT/tools/wallpapers/$scene" "$TMP/$pkg.png" 3840 2160 "$seed" >/dev/null
  python3 - "$TMP/$pkg.png" "$DEST/$pkg" "$pkg" "$title" "$title_ru" <<'PY'
import json, sys
from pathlib import Path
from PIL import Image
src, dest, pkg, title, title_ru = sys.argv[1:]
d = Path(dest); (d / 'contents/images').mkdir(parents=True, exist_ok=True)
im = Image.open(src).convert('RGB')
im.save(d / 'contents/images/3840x2160.jpg', quality=90, optimize=True, progressive=True)
im.resize((2560, 1440), Image.LANCZOS).save(d / 'contents/images/2560x1440.jpg', quality=90, optimize=True)
im.resize((1920, 1080), Image.LANCZOS).save(d / 'contents/images/1920x1080.jpg', quality=90, optimize=True)
im.resize((400, 225), Image.LANCZOS).save(d / 'contents/screenshot.png', optimize=True)
meta = {'KPlugin': {'Authors': [{'Name': 'NOVA OS community project'}], 'Id': pkg,
                    'License': 'CC-BY-SA-4.0', 'Name': title, 'Name[ru]': title_ru}}
(d / 'metadata.json').write_text(json.dumps(meta, ensure_ascii=False, indent=4) + '\n', encoding='utf-8')
print('wrote', d.name)
PY
done <<'LIST'
NOVA-NeonRain|neon-rain.js|7|NOVA Neon Rain|NOVA — неоновый дождь
NOVA-BlueSilk|blue-silk.js|3|NOVA Blue Silk|NOVA — синий шёлк
NOVA-Signal|neon-signal.js|5|NOVA Signal|NOVA — сигнал
NOVA-Paper|paper.js|11|NOVA Paper|NOVA — бумага
LIST
