#!/usr/bin/env python3
"""
Builds the battle sprite sheets from the painted portraits and their cut-out masks.

Input:  apps/web/public/creatures/<id>.webp   the painted portrait (see slice-art.py)
        art/masks/<id>.png                    its cut-out mask (see cut-masks.py; the
                                              seedsnatcher mask was redone with GrabCut, the
                                              model loses the dark hooded figure)
Output: apps/web/public/sprites/<id>-idle.webp    6 frames in a row, looping breath and sway
        apps/web/public/sprites/<id>-attack.webp  5 frames in a row: crouch, rise, strike,
                                                  impact, recover
        apps/web/public/sprites/<id>-cut.webp     the cut-out at rest, 112 x 128, for the Dex
                                                  and collection (and its silhouette)

The frames are the painted creature itself, deformed like a puppet around its feet: no new
poses are drawn, so the art stays the artist's. Run from the repo root:
python3 tools/make-sprites.py   (needs Pillow, numpy, scipy, opencv-python)
"""
import math
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
PORTRAITS = ROOT / "apps" / "web" / "public" / "creatures"
MASKS = ROOT / "art" / "masks"
OUT = ROOT / "apps" / "web" / "public" / "sprites"

FRAME_W, FRAME_H = 224, 256  # one frame; the sheet is N frames wide
SS = 2  # supersampling while warping
QUALITY = 80
# Room the creature may fill inside a frame at rest; the strike frame grows ~12 %.
FIT_W, FIT_H, FOOT = 0.80, 0.80, 0.94  # feet sit at 94 % of the frame height

IDLE = [
    # breathing: taller and narrower, then back; the top sways a little
    dict(sy=1 + 0.03 * math.sin(a), sx=1 - 0.018 * math.sin(a), sway=0.018 * math.cos(a))
    for a in (2 * math.pi * k / 6 for k in range(6))
]
ATTACK = [
    dict(sy=0.92, sx=1.06, sway=0.0, lift=0.0, bulge=0.0),  # crouch
    dict(sy=1.07, sx=0.95, sway=0.0, lift=0.03, bulge=0.02),  # rise
    dict(sy=1.10, sx=1.10, sway=0.0, lift=0.02, bulge=0.08),  # strike, towards the viewer
    dict(sy=1.04, sx=1.07, sway=0.0, lift=0.0, bulge=0.04),  # impact
    dict(sy=1.0, sx=1.0, sway=0.0, lift=0.0, bulge=0.01),  # recover
]


# Masks the model gets only partly right: a lower cut-off keeps their faint body parts.
SOFT_MASK = {"deflagron": 0.04}


def clean_mask(m: np.ndarray, low: float = 0.2) -> np.ndarray:
    """Hard-ish alpha, the creature only (stray background bits dropped), small holes filled,
    faded out towards the edges of the painting so nothing ends in a straight cut."""
    a = np.clip((m.astype(np.float32) / 255 - low) / 0.6, 0, 1)
    solid = a > 0.5
    labels, n = ndimage.label(solid)
    if n > 1:
        sizes = ndimage.sum(solid, labels, range(1, n + 1))
        keep = np.isin(labels, 1 + np.flatnonzero(sizes >= 0.2 * sizes.max()))
        # keep the soft edge around kept parts only
        near = ndimage.binary_dilation(keep, iterations=3)
        a = a * near
        solid = keep
    holes = ndimage.binary_fill_holes(solid) & ~solid
    hl, hn = ndimage.label(holes)
    if hn:
        hs = ndimage.sum(holes, hl, range(1, hn + 1))
        small = np.isin(hl, 1 + np.flatnonzero(hs < 0.004 * m.size))
        a = np.maximum(a, small.astype(np.float32))
    h, w = a.shape
    ramp = lambda n, k: np.clip(np.arange(n, dtype=np.float32) / k, 0, 1)  # noqa: E731
    side = np.minimum(ramp(w, 0.06 * w), ramp(w, 0.06 * w)[::-1])
    top, bottom = ramp(h, 0.06 * h), ramp(h, 0.03 * h)[::-1]
    a = a * side[None, :] * np.minimum(top, bottom)[:, None]
    a = ndimage.grey_erosion(a, size=(2, 2))
    return a


def cutout(cid: str) -> np.ndarray:
    """The creature as premultiplied RGBA floats, cropped to its bounds."""
    rgb = np.asarray(Image.open(PORTRAITS / f"{cid}.webp").convert("RGB"), np.float32) / 255
    m = np.asarray(Image.open(MASKS / f"{cid}.png").convert("L").resize(rgb.shape[1::-1]))
    a = clean_mask(m, SOFT_MASK.get(cid, 0.2))
    ys, xs = np.nonzero(a > 0.05)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    rgba = np.dstack([rgb * a[..., None], a])[y0:y1, x0:x1]
    return rgba


def place(rgba: np.ndarray):
    """Scales the cut-out onto a supersampled frame; returns the canvas and feet anchor."""
    W, H = FRAME_W * SS, FRAME_H * SS
    h, w = rgba.shape[:2]
    s = min(FIT_W * W / w, FIT_H * H / h)
    nw, nh = max(1, round(w * s)), max(1, round(h * s))
    small = cv2.resize(rgba, (nw, nh), interpolation=cv2.INTER_AREA if s < 1 else cv2.INTER_CUBIC)
    canvas = np.zeros((H, W, 4), np.float32)
    x0 = (W - nw) // 2
    y1 = round(FOOT * H)
    y0 = y1 - nh
    canvas[y0:y1, x0 : x0 + nw] = small
    return canvas, (W / 2, float(y1), float(nh))


def warp(canvas, anchor, sy=1.0, sx=1.0, sway=0.0, lift=0.0, bulge=0.0):
    """Puppet deformation around the feet: vertical stretch, width that grows with height
    (bulge), a sway that bends the top more than the base, and a small hop (lift)."""
    ax, ay, h = anchor
    H, W = canvas.shape[:2]
    v, u = np.mgrid[0:H, 0:W].astype(np.float32)
    v = v + lift * h
    src_y = ay - (ay - v) / sy
    t = np.clip((ay - src_y) / h, 0, 1.3)
    scale_x = sx * (1 + bulge * t)
    src_x = ax + (u - ax - sway * h * t * t) / scale_x
    out = cv2.remap(
        canvas,
        src_x.astype(np.float32),
        src_y.astype(np.float32),
        interpolation=cv2.INTER_CUBIC,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=0,
    )
    return np.clip(out, 0, 1)


def to_image(frames) -> Image.Image:
    """Joins supersampled premultiplied frames into a straight-alpha sheet."""
    tiles = []
    for f in frames:
        f = cv2.resize(f, (FRAME_W, FRAME_H), interpolation=cv2.INTER_AREA)
        a = f[..., 3:4]
        rgb = np.where(a > 1e-4, f[..., :3] / np.maximum(a, 1e-4), 0)
        tiles.append(np.dstack([np.clip(rgb, 0, 1), a]))
    sheet = np.concatenate(tiles, axis=1)
    return Image.fromarray((sheet * 255 + 0.5).astype(np.uint8), "RGBA")


def creature_ids() -> list[str]:
    return sorted(p.stem for p in MASKS.glob("*.png"))


def main() -> int:
    ids = sys.argv[1:] or creature_ids()
    if not ids:
        print("no masks in art/masks; run tools/cut-masks.py first", file=sys.stderr)
        return 1
    OUT.mkdir(parents=True, exist_ok=True)
    total = 0
    for cid in ids:
        canvas, anchor = place(cutout(cid))
        for name, poses in (("idle", IDLE), ("attack", ATTACK)):
            path = OUT / f"{cid}-{name}.webp"
            to_image([warp(canvas, anchor, **p) for p in poses]).save(
                path, "WEBP", quality=QUALITY, method=6, alpha_quality=90
            )
            total += path.stat().st_size
        cut = to_image([warp(canvas, anchor, **IDLE[0])]).resize((FRAME_W // 2, FRAME_H // 2), Image.LANCZOS)
        path = OUT / f"{cid}-cut.webp"
        cut.save(path, "WEBP", quality=82, method=6, alpha_quality=90)
        total += path.stat().st_size
    print(f"wrote {len(ids) * 3} files, {total / 1024:.0f} KB, to {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
