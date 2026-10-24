#!/usr/bin/env python3
"""Render NOVA branding PNGs (Calamares logo/welcome) from the NOVA logo geometry.
Deterministic; uses Pillow and the Inter font if present on the build machine."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'image/config/includes.chroot/usr/share/nova/branding'
N = [(24, 72), (24, 24), (33, 24), (62, 58), (62, 24), (72, 24), (72, 72), (63, 72), (34, 38), (34, 72)]


def logo(size: int) -> Image.Image:
    ss = 4
    s = size * ss / 96
    img = Image.new('RGBA', (size * ss, size * ss), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([4 * s, 4 * s, 92 * s, 92 * s], radius=23 * s, fill='#142439')
    d.polygon([(x * s, y * s) for x, y in N], fill='#6fdef6')
    return img.resize((size, size), Image.LANCZOS)


def font(px: int, weight: str = 'SemiBold'):
    for path in (f'/usr/share/fonts/opentype/inter/Inter-{weight}.otf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'):
        if Path(path).is_file():
            return ImageFont.truetype(path, px)
    return ImageFont.load_default()


def welcome(width=720, height=420) -> Image.Image:
    img = Image.new('RGB', (width, height), '#f4f6fa')
    d = ImageDraw.Draw(img)
    for y in range(height):
        k = y / height
        d.line([(0, y), (width, y)], fill=(int(219 * (1 - k) + 244 * k), int(233 * (1 - k) + 246 * k), int(255 * (1 - k) + 250 * k)))
    mark = logo(150)
    img.paste(mark, ((width - 150) // 2, 70), mark)
    title, sub = 'NOVA OS', 'Debian 13 · KDE Plasma'
    f1, f2 = font(54, 'Bold'), font(22, 'Medium')
    w1 = d.textlength(title, font=f1)
    d.text(((width - w1) / 2, 240), title, font=f1, fill='#162033')
    w2 = d.textlength(sub, font=f2)
    d.text(((width - w2) / 2, 312), sub, font=f2, fill='#4b5870')
    return img


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    logo(256).save(OUT / 'logo.png', optimize=True)
    welcome().save(OUT / 'welcome.png', optimize=True)
    for size in (48, 128, 256):
        icon_dir = ROOT / f'image/config/includes.chroot/usr/share/icons/hicolor/{size}x{size}/apps'
        icon_dir.mkdir(parents=True, exist_ok=True)
        logo(size).save(icon_dir / 'nova.png', optimize=True)
    print('branding written to', OUT)
