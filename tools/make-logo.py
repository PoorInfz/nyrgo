#!/usr/bin/env python3
"""
Cuts the nyrGo! logo out of its white background and writes the web and app-icon sizes.

Input:  art/brand/logo-original.png    (the owner's logo on white, 1254 x 1254)
        art/brand/header-original.png  (the owner's header banner, 2000 x 750)
Output: apps/web/public/logo.webp          640 px, transparent, for the header
        apps/web/public/icon-192.png, icon-512.png   app icons (logo on a mint disc)
        apps/web/public/apple-touch-icon.png         180 px
        apps/web/public/header-800.webp, header-1600.webp   the header banner, two widths
Run from the repo root: python3 tools/make-logo.py   (needs Pillow, numpy, scipy)
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art" / "brand" / "logo-original.png"
PUB = ROOT / "apps" / "web" / "public"


def cutout(im: Image.Image) -> Image.Image:
    a = np.asarray(im.convert("RGB")).astype(np.int16)
    # "white" = very light and nearly grey; only white connected to the border is background
    light = (a.min(axis=2) > 236) & (a.max(axis=2) - a.min(axis=2) < 14)
    labels, _ = ndimage.label(light)
    edge = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    bg = np.isin(labels, edge[edge > 0])
    alpha = Image.fromarray(np.where(bg, 0, 255).astype(np.uint8))
    alpha = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.2))
    out = im.convert("RGBA")
    out.putalpha(alpha)
    return out.crop(out.getbbox())


def main():
    logo = cutout(Image.open(SRC))
    w = 640
    logo.resize((w, round(logo.height * w / logo.width)), Image.LANCZOS).save(
        PUB / "logo.webp", "WEBP", quality=86, method=6, alpha_quality=90
    )
    for size, name in ((192, "icon-192.png"), (512, "icon-512.png"), (180, "apple-touch-icon.png")):
        icon = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        disc = Image.new("L", (size * 4, size * 4), 0)
        from PIL import ImageDraw

        ImageDraw.Draw(disc).ellipse((0, 0, size * 4 - 1, size * 4 - 1), fill=255)
        bg = Image.new("RGBA", (size, size), (230, 255, 244, 255))
        bg.putalpha(disc.resize((size, size), Image.LANCZOS))
        if name == "apple-touch-icon.png":  # iOS rounds the corners itself
            bg = Image.new("RGBA", (size, size), (230, 255, 244, 255))
        icon.alpha_composite(bg)
        s = round(size * 0.9)
        small = logo.resize((s, round(logo.height * s / logo.width)), Image.LANCZOS)
        icon.alpha_composite(small, ((size - small.width) // 2, (size - small.height) // 2))
        icon.save(PUB / name, optimize=True)
    header = Image.open(ROOT / "art" / "brand" / "header-original.png").convert("RGB")
    for w in (800, 1600):
        header.resize((w, round(header.height * w / header.width)), Image.LANCZOS).save(
            PUB / f"header-{w}.webp", "WEBP", quality=80, method=6
        )
    print("logo, icons and header written")


if __name__ == "__main__":
    main()
