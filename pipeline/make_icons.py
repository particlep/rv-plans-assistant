"""Generate PWA icons labelled with the configured model name (called by build_data.py)."""
from __future__ import annotations

from PIL import Image, ImageDraw, ImageFont

from common import MODEL, PUBLIC

FONTS = [
    "/System/Library/Fonts/SFNS.ttf", "/System/Library/Fonts/Helvetica.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "C:/Windows/Fonts/arialbd.ttf",
]


def font(size: int):
    for f in FONTS:
        try:
            return ImageFont.truetype(f, size)
        except OSError:
            pass
    return ImageFont.load_default()


def icon(size: int, path, maskable=False):
    img = Image.new("RGB", (size, size), "#14202e")
    d = ImageDraw.Draw(img)
    s = size * (0.72 if maskable else 0.9)
    cx, cy, u, col = size / 2, size * 0.42, s / 10, "#f2f5f8"
    d.rounded_rectangle([cx - 0.45 * u, cy - 3.2 * u, cx + 0.45 * u, cy + 3.0 * u], radius=0.45 * u, fill=col)  # fuselage
    d.rectangle([cx - 4.6 * u, cy - 0.3 * u, cx + 4.6 * u, cy + 0.6 * u], fill=col)  # wing
    d.rectangle([cx - 1.7 * u, cy + 2.3 * u, cx + 1.7 * u, cy + 2.9 * u], fill=col)  # h-stab
    d.rectangle([cx - 1.4 * u, cy - 3.25 * u, cx + 1.4 * u, cy - 3.0 * u], fill="#5b9dff")  # prop
    f = font(int(s * (0.17 if len(MODEL) <= 6 else 0.12)))
    d.text((cx - d.textlength(MODEL, font=f) / 2, size * (0.70 if maskable else 0.74)), MODEL, fill="#5b9dff", font=f)
    img.save(path)


def main():
    out = PUBLIC / "icons"
    out.mkdir(parents=True, exist_ok=True)
    icon(192, out / "icon-192.png")
    icon(512, out / "icon-512.png")
    icon(512, out / "icon-maskable-512.png", maskable=True)
    icon(180, out / "apple-touch-icon.png")


if __name__ == "__main__":
    main()
