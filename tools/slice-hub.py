"""
Cuts the owner's hub art sheets (art/hub/sheet-*.png) into the town's sprites.

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
SHEETS = {1: ROOT / "art/hub/sheet-01.png", 2: ROOT / "art/hub/sheet-02.png"}
OUT = ROOT / "apps/web/public/hub"
MANIFEST = ROOT / "packages/shared/src/hub/art.ts"

# each sheet's background colour
BGS = {1: (26, 31, 35), 2: (13, 15, 21)}
TOLERANCE = 30

# name: (x0, y0, x1, y1) on sheet 1
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

# name: (x0, y0, x1, y1) on sheet 2: room interiors (drawn at 2x) and more props
PIECES_2 = {
    "room-gym": (455, 14, 833, 431),
    "room-arena": (846, 14, 1171, 413),
    "room-house": (1196, 22, 1523, 419),
    "hedge": (16, 870, 186, 920),
    "flower-bed": (16, 928, 186, 992),
    "arch": (378, 804, 488, 920),
    "bench-wood": (695, 824, 799, 874),
    "lamp-tall": (1236, 435, 1280, 575),
    "vending": (1126, 604, 1190, 712),
    "first-aid": (1370, 588, 1429, 694),
    "statue-knight": (1294, 724, 1382, 878),
    "planter": (1033, 690, 1092, 788),
    # furniture for houses (bought in the town, placed by the owner)
    "f-bed-red": (587, 448, 645, 543),
    "f-bed-blue": (662, 448, 721, 543),
    "f-chair-blue": (742, 440, 774, 519),
    "f-sofa-cream": (796, 439, 865, 496),
    "f-tv": (888, 432, 951, 495),
    "f-computer": (1035, 432, 1092, 493),
    "f-nightstand": (971, 444, 1013, 494),
    "f-loveseat-red": (773, 507, 872, 567),
    "f-shelf-small": (971, 507, 1013, 578),
    "f-dresser": (1027, 507, 1097, 578),
    "f-sofa-red": (590, 551, 717, 626),
    "f-chair-wood": (735, 529, 769, 578),
    "f-stool-red": (742, 588, 774, 627),
    "f-sofa-blue": (791, 580, 864, 627),
    "f-aquarium": (891, 574, 952, 628),
    "f-bookcase": (881, 639, 958, 720),
    "f-trophy": (982, 602, 1035, 673),
    "f-sofa-white": (628, 643, 696, 711),
    "f-table-round": (759, 640, 859, 721),
    "f-plant-white": (981, 692, 1024, 778),
    "f-plant-flowers": (1033, 692, 1091, 790),
    "f-rug-red": (673, 736, 751, 796),
    "f-rug-blue": (767, 736, 873, 804),
    "f-rug-purple": (887, 736, 969, 804),
    "f-noticeboard": (1114, 731, 1229, 819),
    "f-arcade": (1213, 606, 1263, 705),
    "f-water-cooler": (1295, 600, 1341, 706),
    "f-crystal": (1223, 831, 1275, 906),
    "f-clock": (1398, 720, 1439, 874),
    "f-banner-red": (1434, 893, 1478, 996),
    "f-banner-gold": (1481, 893, 1526, 996),
    "f-barrel": (582, 933, 621, 992),
    "f-plant-small": (993, 805, 1039, 876),
}

# parts of a crop that belong to a neighbouring piece: (x0, y0, x1, y1) in crop coordinates
ERASE = {
    "plaza": [(419, 0, 484, 130), (452, 380, 484, 454), (0, 28, 14, 84)],
    "house-purple": [(140, 0, 172, 30)],
    "room-gym": [(0, 378, 26, 417)],
}

# Ground textures are cut from the sheet's lighter tiles; each is scaled per channel to this
# mean colour so it matches the grass painted inside the plaza piece.
GROUND_TINT = {"grass": (69, 173, 77)}

# name: (sheet, (x0, y0, x1, y1)) inside a plain tile, well clear of its edges, mirrored into a
# seamless texture
GROUNDS = {
    "grass": (1, (98, 12, 156, 72)),
    "stone": (1, (278, 92, 332, 162)),
    "sand": (1, (180, 98, 250, 162)),
    "path": (2, (25, 23, 87, 86)),
}


def near(p, bg):
    return sum((a - b) ** 2 for a, b in zip(p[:3], bg)) <= TOLERANCE**2


def cut(img: Image.Image, bg) -> Image.Image:
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
        if not near(px[x, y], bg):
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
    sheets = {k: Image.open(p).convert("RGB") for k, p in SHEETS.items()}
    OUT.mkdir(parents=True, exist_ok=True)
    sizes = {}
    for n, pieces in ((1, PIECES), (2, PIECES_2)):
        for name, box in pieces.items():
            crop = sheets[n].crop(box)
            for e in ERASE.get(name, []):
                crop.paste(BGS[n], e)
            piece = cut(crop, BGS[n])
            piece.save(OUT / f"{name}.webp", "WEBP", lossless=True, method=6)
            sizes[name] = piece.size
    grounds = {}
    for name, (n, box) in GROUNDS.items():
        tex = mirror_tile(sheets[n].crop(box))
        if name in GROUND_TINT:
            tex = tint(tex, GROUND_TINT[name])
        tex.save(OUT / f"ground-{name}.webp", "WEBP", lossless=True, method=6)
        grounds[name] = tex.size
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "// Generated by tools/slice-hub.py from art/hub/sheet-*.png. Do not edit by hand.",
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
