#!/usr/bin/env python3
"""
Builds the multi-size .ico tray icons in win32/ from the hand-tuned 16px / 32px PNGs
plus procedurally rendered frames for every other size Windows may ask for.

Why .ico: Electron's Tray on Windows converts the image to an HICON sized to
GetSystemMetrics(SM_CXSMICON) (16px at 100%, 20px at 125%, 24px at 150%, 32px at
200%). For a PNG it always rasterizes the 1x representation, so the @2x PNG is never
used and Windows stretches 16px to the target size, which is the blur reported in
https://community.getmailspring.com/t/blurry-tray-icon-windows/14525. For an .ico,
Electron calls LoadImage(..., size, size) which picks the best-matching frame.

Requires Pillow. Run from anywhere:  python3 build-win32-ico.py
"""
import os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
WIN32 = os.path.join(HERE, 'win32')

# Frame sizes for 100 / 125 / 150 / 175 / 200 / 250 / 300 / 400 % scaling.
SIZES = [16, 20, 24, 28, 32, 40, 48, 64]

# Colors sampled from the existing @2x PNGs.
VARIANTS = {
    'MenuItem-Inbox-Full': ('full', (52, 57, 64)),
    'MenuItem-Inbox-Full-dark': ('full', (255, 255, 255)),
    'MenuItem-Inbox-Full-NewItems': ('full', (246, 61, 96)),
    'MenuItem-Inbox-Full-NewItems-dark': ('full', (246, 61, 141)),
    'MenuItem-Inbox-Full-UnreadItems': ('full', (9, 110, 230)),
    'MenuItem-Inbox-Full-UnreadItems-dark': ('full', (54, 197, 240)),
    'MenuItem-Inbox-Zero': ('zero', (52, 57, 64)),
    'MenuItem-Inbox-Zero-dark': ('zero', (255, 255, 255)),
}

# Geometry traced from the 32px PNGs, in a 32-unit coordinate space.
OUTER = [(5, 2), (27, 2), (30.5, 20), (30.5, 28), (28.5, 30), (3.5, 30), (1.5, 28), (1.5, 20)]
INNER = [(7, 4), (25, 4), (27, 20), (21, 20), (17, 24), (15, 24), (11, 20), (5, 20)]
BARS = [((9, 7), (23, 9)), ((8, 11), (24, 13)), ((7.5, 15), (24.5, 17))]
CHECK = [(11.5, 13), (14.5, 16), (21, 8.5)]

SUPERSAMPLE = 16


def render(style, color, size):
    s = SUPERSAMPLE * size / 32.0
    canvas = SUPERSAMPLE * size
    fill = color + (255,)

    # Draw the tray body into an alpha mask so the inner cutout is a true hole
    # rather than a second color painted over the fill.
    mask = Image.new('L', (canvas, canvas), 0)
    d = ImageDraw.Draw(mask)
    d.polygon([(x * s, y * s) for x, y in OUTER], fill=255)
    d.polygon([(x * s, y * s) for x, y in INNER], fill=0)
    if style == 'full':
        for (x0, y0), (x1, y1) in BARS:
            d.rectangle([x0 * s, y0 * s, x1 * s, y1 * s], fill=255)
    else:
        d.line([(x * s, y * s) for x, y in CHECK], fill=255, width=int(round(2.8 * s)), joint='curve')

    mask = mask.resize((size, size), Image.LANCZOS)
    out = Image.new('RGBA', (size, size), color + (0,))
    out.putalpha(mask)
    return out


def frame(name, style, color, size):
    # The 16px and 32px frames are pixel-hinted by hand; keep them verbatim.
    if size == 16:
        return Image.open(os.path.join(WIN32, f'{name}.png')).convert('RGBA')
    if size == 32:
        return Image.open(os.path.join(WIN32, f'{name}@2x.png')).convert('RGBA')
    return render(style, color, size)


def main():
    for name, (style, color) in VARIANTS.items():
        # Pillow drops any requested size larger than the base image, so the base
        # must be the largest frame. BMP frames rather than PNG: LoadImage reliably
        # decodes PNG-compressed entries only for the 256px slot.
        frames = [frame(name, style, color, size) for size in sorted(SIZES, reverse=True)]
        frames[0].save(
            os.path.join(WIN32, f'{name}.ico'),
            format='ICO',
            sizes=[(sz, sz) for sz in SIZES],
            append_images=frames[1:],
            bitmap_format='bmp',
        )
        print(f'wrote {name}.ico ({", ".join(str(s) for s in SIZES)})')


if __name__ == '__main__':
    main()
