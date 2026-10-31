"""
Cuts the holder outfits out of the owner's character sheet (a 1536x1024 PNG, 5 rows of
characters, 4 views each, the last column 3). For each kept character it writes two WebP files
to apps/web/public/skins/: <id>-front.webp (standing, facing the viewer) and <id>-side.webp
(three-quarter, facing right; the game mirrors it for left). Characters that look like existing
characters owned by others are not cut (see SKIP).

    python3 tools/slice-skins.py path/to/sheet.png
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

OUT = Path(__file__).resolve().parent.parent / "apps/web/public/skins"
BG = np.array([18, 20, 26])
ROWS = [(19, 146), (167, 299), (319, 447), (468, 593), (613, 739)]
# slot boundaries of the five groups in a row (4 views; the last group has 3)
GROUPS = [
    [15, 100, 180, 260, 345],
    [352, 445, 520, 592, 672],
    [682, 770, 848, 925, 1006],
    [1008, 1095, 1168, 1240, 1318],
    [1322, 1400, 1465, 1536],
]
# (row, group) -> id; missing pairs are skipped on purpose
SKINS = {
    (0, 2): "skin_cap",
    (0, 3): "skin_headphones",
    (0, 4): "skin_spiky",
    (1, 0): "skin_bluecoat",
    (1, 1): "skin_witch",
    (1, 2): "skin_ranger",
    (1, 3): "skin_knight",
    (1, 4): "skin_wizard",
    (2, 0): "skin_adventurer",
    (2, 1): "skin_silver",
    (2, 2): "skin_elf",
    (2, 3): "skin_shadow",
    (2, 4): "skin_priestess",
    (3, 0): "skin_casual",
    (3, 1): "skin_strawhat",
    (3, 2): "skin_scientist",
    (3, 3): "skin_medic",
    (3, 4): "skin_farmer",
    (4, 1): "skin_pink",
    (4, 2): "skin_chef",
    (4, 3): "skin_officer",
    (4, 4): "skin_office",
}
# whose second view is not a side view of the same character (a back, another person, or
# hardly turned): the side file repeats the front
SIDE_IS_FRONT = {
    "skin_chef", "skin_farmer", "skin_office", "skin_officer", "skin_scientist",
    "skin_strawhat", "skin_medic", "skin_casual", "skin_spiky",
}
# SKIP: row 0 groups 0-1 (the cap-and-jacket pair), row 4 group 0 (green cap and moustache),
# the creature row and the emote row (not outfits).


def cut(sheet: np.ndarray, x0: int, x1: int, y0: int, y1: int) -> Image.Image:
    box = sheet[y0 - 4 : y1 + 4, x0:x1].copy()
    rgb = box[..., :3].astype(int)
    fg = np.abs(rgb - BG).sum(2) > 30
    # background = the dark colour reachable from the border
    bgmask = ~fg
    lab, _ = ndimage.label(bgmask)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    outside = np.isin(lab, list(border))
    keep = ~outside
    # keep the character (the biggest piece) and anything sizeable touching it
    lab2, n = ndimage.label(keep)
    if n:
        sizes = ndimage.sum(keep, lab2, range(1, n + 1))
        big = sizes.max()
        keep = np.isin(lab2, [i + 1 for i, s in enumerate(sizes) if s >= big * 0.03])
    alpha = np.where(keep, 255, 0).astype(np.uint8)
    img = np.dstack([box[..., :3], alpha])
    ys, xs = np.nonzero(alpha)
    img = img[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]
    return Image.fromarray(img, "RGBA")


def main(path: str) -> None:
    sheet = np.array(Image.open(path).convert("RGBA"))
    OUT.mkdir(parents=True, exist_ok=True)
    for (r, g), sid in SKINS.items():
        y0, y1 = ROWS[r]
        xs = GROUPS[g]
        side = 0 if sid in SIDE_IS_FRONT else 1
        for view, i in (("front", 0), ("side", side)):
            im = cut(sheet, xs[i], xs[i + 1], y0, y1)
            im.save(OUT / f"{sid}-{view}.webp", quality=90, alpha_quality=100, method=6)
        print(sid, im.size)


if __name__ == "__main__":
    main(sys.argv[1])
