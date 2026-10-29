#!/usr/bin/env python3
"""
Cuts the painted creature sheets into one portrait per creature.

Input:  art/sheets/sheet-01-10.jpg … sheet-41-50.jpg (5 columns × 2 rows, Dex order,
        each tile with a name strip at the bottom that is removed).
Output: apps/web/public/creatures/<id>.webp        portrait, 384 px wide
        apps/web/public/creatures/<id>-thumb.webp  thumbnail, 128 px wide

Run from the repo root:  python3 tools/slice-art.py
Requires Pillow (pip install pillow). The ids come from packages/shared (pnpm build first).
"""
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SHEETS = ROOT / "art" / "sheets"
OUT = ROOT / "apps" / "web" / "public" / "creatures"

# Grid of the sheets (1536 × 1024): column and row edges, measured on the gutters.
COLS = [(0, 306), (310, 612), (616, 920), (924, 1225), (1230, 1536)]
ROWS = [(0, 510), (513, 1024)]
# Height of the name strip at the bottom of every tile.
LABEL_PX = 65
PORTRAIT_W = 384
THUMB_W = 128
QUALITY = 82


def creature_ids() -> list[str]:
    script = "import('@nyrgo/shared').then(m => console.log(JSON.stringify(m.CREATURES.map(c => c.id))))"
    out = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=ROOT / "apps" / "web",
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    return json.loads(out.strip().splitlines()[-1])


def main() -> int:
    ids = creature_ids()
    if len(ids) != 50:
        print(f"expected 50 creatures, got {len(ids)}", file=sys.stderr)
        return 1
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*.webp"):
        old.unlink()
    n = 0
    for sheet in range(5):
        path = SHEETS / f"sheet-{sheet * 10 + 1:02d}-{sheet * 10 + 10:02d}.jpg"
        im = Image.open(path).convert("RGB")
        if im.size != (1536, 1024):
            print(f"{path.name}: unexpected size {im.size}", file=sys.stderr)
            return 1
        for r, (y0, y1) in enumerate(ROWS):
            for c, (x0, x1) in enumerate(COLS):
                cid = ids[sheet * 10 + r * 5 + c]
                tile = im.crop((x0, y0, x1, y1 - LABEL_PX))
                for width, suffix in ((PORTRAIT_W, ""), (THUMB_W, "-thumb")):
                    h = round(tile.height * width / tile.width)
                    tile.resize((width, h), Image.LANCZOS).save(
                        OUT / f"{cid}{suffix}.webp", "WEBP", quality=QUALITY, method=6
                    )
                n += 1
    total = sum(p.stat().st_size for p in OUT.glob("*.webp"))
    print(f"wrote {n} portraits and thumbnails, {total / 1024:.0f} KB, to {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
