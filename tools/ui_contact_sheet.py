#!/usr/bin/env python3
"""Make one JPEG contact sheet per screen configuration from UI smoke PNGs."""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw


def sheet(directory: Path, out: Path, width: int = 420) -> None:
    pngs = sorted(directory.glob('*.png'))
    if not pngs:
        return
    tiles = []
    for p in pngs:
        im = Image.open(p).convert('RGB')
        im.thumbnail((width, width * 3 // 4))
        label = p.stem
        meta = p.with_suffix('.json')
        if meta.is_file():
            m = json.loads(meta.read_text())
            ok = m.get('fits_screen') and m.get('content_fits_window')
            label += f"  {m['window'][0]}×{m['window'][1]} {'OK' if ok else 'CHECK'}"
        tiles.append((im, label))
    cols = 4
    th = max(t.height for t, _ in tiles) + 22
    rows = (len(tiles) + cols - 1) // cols
    canvas = Image.new('RGB', (cols * (width + 8) + 8, rows * (th + 8) + 8), '#30343b')
    d = ImageDraw.Draw(canvas)
    for i, (im, label) in enumerate(tiles):
        x, y = 8 + (i % cols) * (width + 8), 8 + (i // cols) * (th + 8)
        canvas.paste(im, (x, y + 20))
        d.text((x + 2, y + 4), label, fill='#ffffff')
    canvas.save(out, quality=82)


if __name__ == '__main__':
    root, target = Path(sys.argv[1]), Path(sys.argv[2])
    target.mkdir(parents=True, exist_ok=True)
    for d in sorted(p for p in root.iterdir() if p.is_dir()):
        sheet(d, target / f'{d.name}.jpg')
    report = root / 'ui-report.json'
    if report.is_file():
        (target / 'ui-report.json').write_text(report.read_text())
