#!/usr/bin/env python3
"""Generate the NOVA boot-menu background (GRUB, BIOS and UEFI) from NOVA artwork.

Output: image/config/includes.binary/boot/grub/nova/splash.png (1920×1080).
The binary hook 096-nova-bootmenu puts it in place of live-build's default
splash and switches the GRUB theme to "crop" scaling, so 4:3 and 16:9 screens
both show it undistorted. The left middle (menu) and bottom (hints) stay dark.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
O = ROOT / 'image/config/includes.chroot'
OUT = ROOT / 'image/config/includes.binary/boot/grub/nova/splash.png'
SKY = O / 'usr/share/wallpapers/NOVA-NeonRain/contents/images/1920x1080.jpg'   # default style artwork
LOGO = O / 'usr/share/nova/branding/logo.png'
VERSION = (ROOT / 'VERSION').read_text().strip()


def font(size, bold=False):
    for path in ('/usr/share/fonts/opentype/inter/Inter-Bold.otf' if bold else '/usr/share/fonts/opentype/inter/Inter-Regular.otf',
                 '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' if bold else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'):
        if Path(path).is_file():
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def main():
    W, H = 1920, 1080
    img = Image.open(SKY).convert('RGB').resize((W, H))
    from PIL import ImageEnhance
    img = ImageEnhance.Brightness(img).enhance(0.62)          # calmer behind the menu text
    # darken the left side where GRUB draws the menu, and the bottom hint line
    shade = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(shade)
    for x in range(W):
        v = int(max(0, 235 * (1 - x / (W * 0.70))))
        d.line([(x, 0), (x, H)], fill=v)
    d.rectangle([0, int(H * 0.86), W, H], fill=150)
    shade = shade.filter(ImageFilter.GaussianBlur(40))
    img = Image.composite(Image.new('RGB', (W, H), (6, 10, 24)), img, shade)
    # visible area on a 4:3 screen with "crop" scaling starts at x = 240
    x0, y0 = 240 + 64, 70
    logo = Image.open(LOGO).convert('RGBA').resize((150, 150), Image.LANCZOS)
    img.paste(logo, (x0, y0), logo)
    draw = ImageDraw.Draw(img)
    draw.text((x0 + 185, y0 + 12), 'NOVA OS', font=font(84, True), fill=(240, 244, 255))
    draw.text((x0 + 190, y0 + 108), f'{VERSION}  ·  Live  ·  KDE Plasma 6  ·  Debian 13', font=font(30),
              fill=(170, 186, 220))
    draw.line([(x0, y0 + 190), (x0 + 760, y0 + 190)], fill=(113, 180, 255), width=3)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    img.save(OUT, optimize=True)
    print('written', OUT.relative_to(ROOT), OUT.stat().st_size, 'bytes')


if __name__ == '__main__':
    main()
