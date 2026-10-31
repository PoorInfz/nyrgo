"""
Cuts the owner's hub art sheet (art/hub/sheet-01.png) into the town's sprites.

Each piece is cropped from the sheet, its dark background is removed by flood fill from the
crop's edges (so dark outlines inside the art stay), trimmed and saved as WebP in
apps/web/public/hub/. Ground textures are cut from the middle of plain tiles and mirrored into
seamless 2x2 textures. A TypeScript manifest with every sprite's size is written for the shared
map, so the server and the client agree on footprints.

Pieces that resemble another franchise (the red centre with the ball emblem, the ball items,
the cap-wearing trainers and the small creatures) are deliberately not cut: the game's own
explorer and nyrGo! creatures take their place.

Run: python3 tools/slice-hub.py
"""
from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SHEET = ROOT / "art/hub/sheet-01.png"
OUT = ROOT / "apps/web/public/hub"
MANIFEST = ROOT / "packages/shared/src/hub/art.ts"

BG = (26, 31, 35)
TOLERANCE = 30

# name: (x0, y0, x1, y1) on the sheet
PIECES = {
    "gym": (658, 8, 882, 222),
    "arena": (895, 8, 1134, 222),
    "market": (433, 230, 654, 447),
    "house-red": (663, 226, 845, 447),
    "house-blue": (848, 230, 1020, 447),
    "house-purple": (1026, 230, 1198, 447),
    "portal": (743, 452, 957, 587),
    "plaza": (322, 462, 806, 916),
    "tree-round": (628, 438, 732, 548),
    "tree-pine": (956, 446, 1052, 584),
    "tree-cherry": (1408, 638, 1532, 782),
    "lamp": (1150, 8, 1207, 130),
    "banner-blue": (1336, 6, 1400, 122),
    "board": (1410, 16, 1502, 110),
    "bench": (1320, 332, 1402, 380),
    "bench-long": (1214, 376, 1314, 437),
    "flowers": (1320, 266, 1407, 324),
    "flower-pot": (1216, 193, 1264, 252),
    "well": (1223, 503, 1287, 592),
    "statue": (1430, 443, 1532, 592),
    "trophy": (1363, 456, 1420, 527),
    "fence": (1058, 528, 1214, 562),
    "flower-box": (1308, 588, 1514, 642),
    "bush": (1130, 868, 1197, 927),
    "umbrella": (1126, 938, 1194, 1017),
    "pond": (1196, 933, 1380, 1024),
    "signpost": (953, 943, 997, 1017),
}

# parts of a crop that belong to a neighbouring piece: (x0, y0, x1, y1) in crop coordinates
ERASE = {
    "plaza": [(419, 0, 484, 130), (452, 380, 484, 454), (0, 28, 14, 84)],
    "house-purple": [(140, 0, 172, 30)],
}

# Ground textures are cut from the sheet's lighter tiles; each is scaled per channel to this
# mean colour so it matches the grass painted inside the plaza piece.
GROUND_TINT = {"grass": (69, 173, 77)}

# name: (x0, y0, x1, y1) inside a plain tile, mirrored into a seamless texture
GROUNDS = {
    "grass": (98, 12, 156, 72),
    "stone": (278, 92, 332, 162),
    "sand": (180, 98, 250, 162),
}


def near_bg(p):
    return sum((a - b) ** 2 for a, b in zip(p[:3], BG)) <= TOLERANCE**2


def cut(img: Image.Image) -> Image.Image:
    img = img.convert("RGBA")
    w, h = img.size
    px = img.load()
    seen = [[False] * w for _ in range(h)]
    q = deque()
    for x in range(w):
        q.append((x, 0))
        q.append((x, h - 1))
    for y in range(h):
        q.append((0, y))
        q.append((w - 1, y))
    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= w or y >= h or seen[y][x]:
            continue
        seen[y][x] = True
        if not near_bg(px[x, y]):
            continue
        px[x, y] = (0, 0, 0, 0)
        q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
    box = img.getbbox()
    return img.crop(box) if box else img


def mirror_tile(img: Image.Image) -> Image.Image:
    w, h = img.size
    out = Image.new("RGB", (w * 2, h * 2))
    out.paste(img, (0, 0))
    out.paste(img.transpose(Image.FLIP_LEFT_RIGHT), (w, 0))
    out.paste(img.transpose(Image.FLIP_TOP_BOTTOM), (0, h))
    out.paste(img.transpose(Image.ROTATE_180), (w, h))
    return out


def tint(img: Image.Image, target) -> Image.Image:
    bands = img.convert("RGB").split()
    out = []
    for band, t in zip(bands, target):
        hist = band.histogram()
        mean = sum(i * n for i, n in enumerate(hist)) / max(1, sum(hist))
        k = t / mean
        out.append(band.point(lambda v, k=k: min(255, round(v * k))))
    return Image.merge("RGB", out)


def main():
    sheet = Image.open(SHEET).convert("RGB")
    OUT.mkdir(parents=True, exist_ok=True)
    sizes = {}
    for name, box in PIECES.items():
        crop = sheet.crop(box)
        for e in ERASE.get(name, []):
            crop.paste(BG, e)
        piece = cut(crop)
        piece.save(OUT / f"{name}.webp", "WEBP", lossless=True, method=6)
        sizes[name] = piece.size
    grounds = {}
    for name, box in GROUNDS.items():
        tex = mirror_tile(sheet.crop(box))
        if name in GROUND_TINT:
            tex = tint(tex, GROUND_TINT[name])
        tex.save(OUT / f"ground-{name}.webp", "WEBP", lossless=True, method=6)
        grounds[name] = tex.size
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "// Generated by tools/slice-hub.py from art/hub/sheet-01.png. Do not edit by hand.",
        "",
        "/** Every town sprite's size in pixels (1 sheet pixel = 1 world pixel). */",
        "export const HUB_SPRITES = {",
    ]
    lines += [f"  '{n}': {{ w: {w}, h: {h} }}," for n, (w, h) in sizes.items()]
    lines += ["} as const;", "", "export type HubSprite = keyof typeof HUB_SPRITES;", ""]
    lines += ["/** Seamless ground textures. */", "export const HUB_GROUNDS = {"]
    lines += [f"  {n}: {{ w: {w}, h: {h} }}," for n, (w, h) in grounds.items()]
    lines += ["} as const;", "", "export type HubGround = keyof typeof HUB_GROUNDS;", ""]
    MANIFEST.write_text("\n".join(lines))
    print(f"{len(sizes)} sprites, {len(grounds)} grounds -> {OUT}")


if __name__ == "__main__":
    main()
