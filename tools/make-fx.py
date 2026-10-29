#!/usr/bin/env python3
"""
Draws the element effects played over a fighter when a move lands: one sheet per element,
8 frames in a row, transparent background, drawn procedurally (no outside art).

Output: apps/web/public/fx/<element>.webp
Run from the repo root: python3 tools/make-fx.py   (needs Pillow and numpy)
"""
import math
import random
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "apps" / "web" / "public" / "fx"
SIZE = 192  # one frame, square
SS = 2
FRAMES = 8
QUALITY = 82
S = SIZE * SS
C = S / 2


def rgb(h: str):
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))


def mix(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def ease_out(t):
    return 1 - (1 - t) ** 3


class Frame:
    """A supersampled RGBA layer with a glow pass: shapes drawn on `draw` also bloom."""

    def __init__(self):
        self.img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        self.draw = ImageDraw.Draw(self.img)

    def finish(self, glow=10, glow_strength=1.0) -> Image.Image:
        base = self.img
        if glow:
            g = base.filter(ImageFilter.GaussianBlur(glow * SS / 2))
            a = np.asarray(g, np.float32)
            a[..., 3] *= glow_strength
            g = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGBA")
            out = Image.new("RGBA", (S, S), (0, 0, 0, 0))
            out.alpha_composite(g)
            out.alpha_composite(base)
            base = out
        return base.resize((SIZE, SIZE), Image.LANCZOS)


def blob(d, x, y, r, color, alpha):
    if r <= 0 or alpha <= 0:
        return
    d.ellipse((x - r, y - r, x + r, y + r), fill=(*color, max(0, min(255, round(alpha)))))


def poly_rot(cx, cy, pts, ang):
    ca, sa = math.cos(ang), math.sin(ang)
    return [(cx + px * ca - py * sa, cy + px * sa + py * ca) for px, py in pts]


# ------------------------------------------------------------------ one function per element


def water(k, t, rnd):
    f = Frame()
    col, light = rgb("#38bdf8"), (224, 247, 255)
    # two ripples
    for lag in (0, 0.25):
        tt = max(0.0, t - lag)
        if tt <= 0:
            continue
        r = S * 0.12 + S * 0.32 * ease_out(tt)
        w = max(1, round(S * 0.035 * (1 - tt)))
        a = 255 * (1 - tt)
        f.draw.ellipse((C - r, C - r * 0.55, C + r, C + r * 0.55), outline=(*col, round(a)), width=w)
    # droplets on parabolas
    for i in range(16):
        ang = rnd[i] * 2 * math.pi
        sp = 0.25 + 0.2 * rnd[i + 16]
        x = C + math.cos(ang) * S * sp * t
        y = C - S * 0.28 * math.sin(math.pi * min(1, t * 1.1)) * (0.6 + rnd[i + 32] * 0.6) + math.sin(ang) * S * 0.12 * t
        r = S * (0.03 - 0.018 * t) * (0.7 + rnd[i + 48])
        blob(f.draw, x, y, r, mix(col, light, rnd[i + 64] * 0.6), 255 * (1 - t**2))
    # splash core
    if t < 0.45:
        r = S * (0.08 + 0.2 * t)
        blob(f.draw, C, C, r, light, 230 * (1 - t / 0.45))
    return f.finish(8)


def fire(k, t, rnd):
    f = Frame()
    hot, mid, cool = (255, 246, 200), rgb("#f97316"), (200, 40, 20)
    if t < 0.4:
        for r, c, a in ((0.42, mid, 150), (0.28, (255, 190, 80), 200), (0.15, hot, 255)):
            blob(f.draw, C, C + S * 0.04, S * r * (0.3 + 1.6 * t), c, a * (1 - t / 0.4))
    tongue = [(0, -1.6), (0.45, -0.5), (0.6, 0.3), (0.3, 0.85), (0, 1), (-0.3, 0.85), (-0.6, 0.3), (-0.45, -0.5)]
    for i in range(26):
        delay = rnd[i] * 0.4
        tt = (t - delay) / (1 - delay)
        if tt <= 0 or tt >= 1:
            continue
        ang = -math.pi / 2 + (rnd[i + 40] - 0.5) * 2.2
        dist = S * (0.04 + 0.34 * ease_out(tt)) * (0.6 + rnd[i + 80] * 0.6)
        x = C + math.cos(ang) * dist + math.sin(tt * 9 + i) * S * 0.015
        y = C + S * 0.1 + math.sin(ang) * dist - S * 0.08 * tt
        sz = S * 0.06 * (1 - 0.7 * tt) * (0.7 + rnd[i + 120] * 0.6)
        lean = (ang + math.pi / 2) * 0.5
        alpha = 255 * (1 - tt**1.5)
        for scale, c in ((1.0, mix(mid, cool, tt)), (0.6, mix((255, 200, 90), mid, tt)), (0.3, hot)):
            pts = poly_rot(x, y, [(px * sz * scale, py * sz * scale) for px, py in tongue], lean)
            f.draw.polygon(pts, fill=(*c, round(alpha)))
    return f.finish(10, 1.3)


def nature(k, t, rnd):
    f = Frame()
    greens = [rgb("#4ade80"), (34, 160, 80), (180, 240, 120)]
    leaf = [(-1, 0), (-0.5, -0.38), (0.3, -0.36), (1, 0), (0.3, 0.36), (-0.5, 0.38)]
    for i in range(14):
        base = rnd[i] * 2 * math.pi
        ang = base + t * 2.6
        dist = S * (0.05 + 0.36 * ease_out(t)) * (0.7 + rnd[i + 20] * 0.4)
        x, y = C + math.cos(ang) * dist, C + math.sin(ang) * dist * 0.85
        sz = S * 0.05 * (0.8 + rnd[i + 40] * 0.5) * (1 - 0.4 * t)
        pts = poly_rot(x, y, [(px * sz, py * sz) for px, py in leaf], ang * 2 + rnd[i + 60] * 6)
        c = greens[i % 3]
        f.draw.polygon(pts, fill=(*c, round(255 * (1 - t**3))))
    for i in range(10):
        if (k + i) % 3 == 0:
            x, y = C + (rnd[i + 80] - 0.5) * S * 0.7, C + (rnd[i + 90] - 0.5) * S * 0.7
            blob(f.draw, x, y, S * 0.012, (240, 255, 210), 230 * (1 - t))
    return f.finish(7)


def earth(k, t, rnd):
    f = Frame()
    rocks = [(168, 162, 158), (120, 104, 90), (196, 170, 130)]
    for i in range(8):  # dust
        ang = rnd[i] * math.pi + math.pi
        r = S * (0.08 + 0.18 * ease_out(t)) * (0.7 + rnd[i + 8] * 0.5)
        x = C + math.cos(ang) * S * 0.25 * t
        y = C + S * 0.18 - S * 0.06 * t
        blob(f.draw, x, y, r * 0.7, (150, 135, 120), 55 * (1 - t))
    for i in range(11):  # shards on ballistic arcs
        vx = (rnd[i + 20] - 0.5) * 0.9
        vy = -(0.7 + rnd[i + 31] * 0.6)
        x = C + vx * S * 0.5 * t
        y = C + S * 0.2 + vy * S * 0.6 * t + S * 0.9 * t * t
        sz = S * (0.045 + rnd[i + 42] * 0.04)
        n = 5
        pts = [
            (math.cos(2 * math.pi * j / n) * sz * (0.6 + rnd[i * 5 + j + 60] * 0.6),
             math.sin(2 * math.pi * j / n) * sz * (0.6 + rnd[i * 5 + j + 120] * 0.6))
            for j in range(n)
        ]
        pts = poly_rot(x, y, pts, t * 6 * (rnd[i + 180] - 0.5))
        f.draw.polygon(pts, fill=(*rocks[i % 3], round(255 * (1 - t**4))), outline=(70, 60, 50, round(255 * (1 - t**4))))
    if t < 0.35:  # impact crack
        a = round(255 * (1 - t / 0.35))
        for j in range(5):
            ang = math.pi + j * math.pi / 4
            f.draw.line([(C, C + S * 0.2), (C + math.cos(ang) * S * 0.2, C + S * 0.2 + math.sin(ang) * S * 0.08)], fill=(255, 230, 180, a), width=SS * 2)
    return f.finish(5, 0.7)


def electric(k, t, rnd):
    # "Gas": purple fumes with crackling sparks
    f = Frame()
    col, light = rgb("#c084fc"), (245, 225, 255)
    for i in range(10):
        ang = rnd[i] * 2 * math.pi
        dist = S * 0.3 * ease_out(t) * (0.4 + rnd[i + 10])
        r = S * (0.06 + 0.1 * t) * (0.7 + rnd[i + 20] * 0.5)
        blob(f.draw, C + math.cos(ang) * dist, C + math.sin(ang) * dist, r, (140, 70, 200), 110 * (1 - t))
    r2 = random.Random(1000 + k)  # bolts flicker: new ones every frame
    for b in range(3 if t < 0.7 else 1):
        ang = r2.random() * 2 * math.pi
        pts = [(C, C)]
        L = S * (0.18 + 0.25 * r2.random())
        for s in range(1, 6):
            d = L * s / 5
            off = (r2.random() - 0.5) * S * 0.08
            pts.append((C + math.cos(ang) * d - math.sin(ang) * off, C + math.sin(ang) * d + math.cos(ang) * off))
        a = round(255 * (1 - t * 0.8))
        f.draw.line(pts, fill=(*col, a), width=SS * 4, joint="curve")
        f.draw.line(pts, fill=(*light, a), width=SS * 2, joint="curve")
    if t < 0.3:
        blob(f.draw, C, C, S * (0.07 + 0.2 * t), light, 240 * (1 - t / 0.3))
    return f.finish(10, 1.1)


def wind(k, t, rnd):
    # "Airdrop": a gust that spirals out, with drifting sparkles
    f = Frame()
    col, light = rgb("#67e8f9"), (235, 255, 255)
    for j in range(4):
        rot = j * math.pi / 2 + t * 3.2
        r0 = S * (0.08 + 0.3 * ease_out(t)) * (0.8 + 0.1 * j)
        a = round(230 * (1 - t))
        box = (C - r0, C - r0 * 0.7, C + r0, C + r0 * 0.7)
        start = math.degrees(rot)
        f.draw.arc(box, start, start + 100, fill=(*col, a), width=max(2, round(SS * 9 * (1 - t * 0.7))))
        f.draw.arc(box, start + 20, start + 80, fill=(*light, a), width=max(1, round(SS * 4 * (1 - t * 0.7))))
    for i in range(10):
        x = C + (rnd[i] - 0.5) * S * 0.8 + math.sin(t * 6 + i) * S * 0.03
        y = C - S * 0.35 + (rnd[i + 10] * 0.3 + t * 0.6) * S
        blob(f.draw, x, y, S * 0.012, light, 220 * (1 - t))
    return f.finish(7)


def ice(k, t, rnd):
    f = Frame()
    col, light = rgb("#bfdbfe"), (255, 255, 255)
    grow = min(1, t / 0.45)
    shatter = max(0, (t - 0.45) / 0.55)
    for i in range(9):
        ang = 2 * math.pi * i / 9 + rnd[i] * 0.3
        L = S * (0.14 + 0.18 * rnd[i + 9]) * ease_out(grow)
        w = S * 0.03
        out = S * 0.35 * shatter
        cx, cy = C + math.cos(ang) * (L / 2 + out), C + math.sin(ang) * (L / 2 + out)
        pts = poly_rot(cx, cy, [(-L / 2, 0), (0, -w), (L / 2, 0), (0, w)], ang)
        a = round(255 * (1 - shatter**2))
        f.draw.polygon(pts, fill=(*col, a), outline=(*light, a))
    if shatter > 0:
        for i in range(18):
            ang = rnd[i + 30] * 2 * math.pi
            d = S * (0.1 + 0.35 * shatter) * (0.6 + rnd[i + 50] * 0.6)
            blob(f.draw, C + math.cos(ang) * d, C + math.sin(ang) * d, S * 0.012, light, 255 * (1 - shatter))
    blob(f.draw, C, C, S * 0.06 * (1 - shatter), light, 220)
    return f.finish(7)


def cosmic(k, t, rnd):
    # "Moon": a crescent rises in a halo of twinkling stars
    f = Frame()
    col, light = rgb("#818cf8"), (238, 240, 255)
    R = S * (0.1 + 0.12 * ease_out(min(1, t * 1.6)))
    a = round(255 * (1 - max(0, t - 0.6) / 0.4))
    f.draw.ellipse((C - R, C - R, C + R, C + R), fill=(*light, a))
    off = R * 0.45
    f.draw.ellipse((C - R + off, C - R - off * 0.4, C + R + off, C + R - off * 0.4), fill=(0, 0, 0, 0))
    halo = S * (0.18 + 0.2 * t)
    f.draw.ellipse((C - halo, C - halo, C + halo, C + halo), outline=(*col, round(160 * (1 - t))), width=SS * 3)
    for i in range(12):
        ang = rnd[i] * 2 * math.pi
        d = S * (0.2 + 0.2 * rnd[i + 12]) * (0.6 + 0.4 * t)
        tw = abs(math.sin(t * 7 + rnd[i + 24] * 6))
        sz = S * 0.03 * tw
        x, y = C + math.cos(ang) * d, C + math.sin(ang) * d
        sa = round(255 * tw * (1 - t**2))
        f.draw.polygon([(x, y - sz), (x + sz * 0.25, y - sz * 0.25), (x + sz, y), (x + sz * 0.25, y + sz * 0.25),
                        (x, y + sz), (x - sz * 0.25, y + sz * 0.25), (x - sz, y), (x - sz * 0.25, y - sz * 0.25)],
                       fill=(*light, sa))
    return f.finish(9)


def light(k, t, rnd):
    # "Oracle": a turning sunburst and a widening ring
    f = Frame()
    col, white = rgb("#fde68a"), (255, 252, 235)
    rot = t * 0.9
    L = S * (0.15 + 0.3 * ease_out(t))
    a = round(220 * (1 - t))
    for j in range(12):
        ang = rot + 2 * math.pi * j / 12
        w = 0.07
        ll = L * (1 if j % 2 == 0 else 0.7)
        f.draw.polygon([(C, C), (C + math.cos(ang - w) * ll, C + math.sin(ang - w) * ll),
                        (C + math.cos(ang + w) * ll, C + math.sin(ang + w) * ll)], fill=(*col, a))
    r = S * (0.08 + 0.36 * t)
    f.draw.ellipse((C - r, C - r, C + r, C + r), outline=(*white, round(255 * (1 - t))), width=SS * 3)
    blob(f.draw, C, C, S * 0.09 * (1 - t * 0.6), white, 255 * (1 - t**2))
    return f.finish(12, 1.2)


def shadow(k, t, rnd):
    # "FUD": dark smoke with a violet rim and grasping tendrils
    f = Frame()
    dark, rim = (40, 18, 64), rgb("#7c3aed")
    for i in range(12):
        ang = rnd[i] * 2 * math.pi
        d = S * 0.25 * ease_out(t) * (0.3 + rnd[i + 12])
        r = S * (0.07 + 0.1 * t) * (0.6 + rnd[i + 24] * 0.6)
        x, y = C + math.cos(ang) * d, C + math.sin(ang) * d
        blob(f.draw, x, y, r * 1.15, rim, 150 * (1 - t))
        blob(f.draw, x, y, r, dark, 220 * (1 - t**1.5))
    for j in range(5):
        ang = 2 * math.pi * j / 5 + rnd[j + 40]
        pts = []
        for s in range(8):
            u = s / 7
            d = S * 0.38 * ease_out(min(1, t * 1.4)) * u
            wob = math.sin(u * 5 + t * 8 + j) * S * 0.04 * u
            pts.append((C + math.cos(ang) * d - math.sin(ang) * wob, C + math.sin(ang) * d + math.cos(ang) * wob))
        f.draw.line(pts, fill=(*rim, round(230 * (1 - t))), width=max(1, round(SS * 4 * (1 - t * 0.7))), joint="curve")
    return f.finish(8)


ELEMENTS = {
    "water": water, "fire": fire, "nature": nature, "earth": earth, "electric": electric,
    "wind": wind, "ice": ice, "cosmic": cosmic, "light": light, "shadow": shadow,
}


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    total = 0
    for i, (name, fn) in enumerate(ELEMENTS.items()):
        rand = random.Random(7 + i)
        rnd = [rand.random() for _ in range(300)]
        sheet = Image.new("RGBA", (SIZE * FRAMES, SIZE), (0, 0, 0, 0))
        for k in range(FRAMES):
            sheet.alpha_composite(fn(k, (k + 0.5) / FRAMES, rnd), (k * SIZE, 0))
        path = OUT / f"{name}.webp"
        sheet.save(path, "WEBP", quality=QUALITY, method=6, alpha_quality=90)
        total += path.stat().st_size
    print(f"wrote {len(ELEMENTS)} effect sheets, {total / 1024:.0f} KB, to {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
