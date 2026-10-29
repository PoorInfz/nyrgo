#!/usr/bin/env python3
"""
Cuts every painted creature out of its background: writes one grey-scale mask per creature.

Input:  apps/web/public/creatures/<id>.webp
Output: art/masks/<id>.png  (white = creature), used by make-sprites.py

Model: BiRefNet-lite (MIT licence), the ONNX export shipped by the rembg project:
  pip install "rembg[cpu]" onnx
  python3 -c "from rembg import new_session; new_session('birefnet-general-lite')"
which downloads it to ~/.rembg/models/birefnet-general-lite/birefnet-general-lite.onnx.

At its fixed 1024 x 1024 input the model peaks above 6 GB when run in one go. This script
splits the graph into pieces, runs them one after another and parks the intermediate tensors
in memory-mapped files between pieces, which keeps it under ~5.7 GB. On a machine with more
memory, plain `rembg` with the same model gives the same masks.

Run from the repo root:  python3 tools/cut-masks.py [id ...]   (~40 s per creature on 2 CPUs)
"""
import gc
import sys
import tempfile
import time
from pathlib import Path

import numpy as np
import onnx
import onnxruntime as ort
from onnx import helper, shape_inference
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PORTRAITS = ROOT / "apps" / "web" / "public" / "creatures"
OUT = ROOT / "art" / "masks"
MODEL = Path.home() / ".rembg" / "models" / "birefnet-general-lite" / "birefnet-general-lite.onnx"
SIDE = 1024


def split_model(path: Path, workdir: Path) -> list[Path]:
    """Cuts the graph into consecutive pieces; the decoder's tail, where memory peaks, finer."""
    m = shape_inference.infer_shapes(onnx.load(str(path)))
    g = m.graph
    types = {vi.name: vi for vi in list(g.value_info) + list(g.input) + list(g.output)}
    inits = {t.name: t for t in g.initializer}
    nodes = list(g.node)
    n = len(nodes)
    uses: dict[str, list[int]] = {}
    for i, node in enumerate(nodes):
        for x in node.input:
            if x:
                uses.setdefault(x, []).append(i)
    graph_outputs = {o.name for o in g.output}
    tail = round(n * 39 / 40)
    bounds = [round(n * k / 40) for k in range(39)] + [tail + round((n - tail) * j / 30) for j in range(31)]
    paths = []
    for k in range(len(bounds) - 1):
        a, b = bounds[k], bounds[k + 1]
        chunk = nodes[a:b]
        produced = {o for node in chunk for o in node.output}
        inputs, seen, weights = [], set(), []
        for node in chunk:
            for x in node.input:
                if not x or x in produced or x in seen:
                    continue
                seen.add(x)
                (weights if x in inits else inputs).append(inits.get(x, x))
        outputs = [o for o in sorted(produced) if o in graph_outputs or any(u >= b for u in uses.get(o, []))]
        sub = helper.make_graph(chunk, f"c{k}", [types[x] for x in inputs], [types[o] for o in outputs], weights)
        sm = helper.make_model(sub, opset_imports=m.opset_import)
        sm.ir_version = m.ir_version
        p = workdir / f"c{k}.onnx"
        onnx.save(sm, str(p))
        paths.append(p)
    return paths


class Cutter:
    def __init__(self, pieces: list[Path], workdir: Path):
        so = ort.SessionOptions()
        so.enable_cpu_mem_arena = False
        so.enable_mem_pattern = False
        so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_BASIC
        so.log_severity_level = 3
        self.sess = [ort.InferenceSession(str(p), so, providers=["CPUExecutionProvider"]) for p in pieces]
        self.need = [{i.name for s in self.sess[k + 1 :] for i in s.get_inputs()} for k in range(len(self.sess))]
        self.final = self.sess[-1].get_outputs()[-1].name
        self.workdir = workdir

    def mask(self, im: Image.Image) -> np.ndarray:
        x = np.asarray(im.resize((SIDE, SIDE), Image.BICUBIC), np.float32) / 255
        x = ((x - [0.485, 0.456, 0.406]) / [0.229, 0.224, 0.225]).transpose(2, 0, 1)[None].astype(np.float32)
        env = {self.sess[0].get_inputs()[0].name: x}
        for k, s in enumerate(self.sess):
            names = [o.name for o in s.get_outputs()]
            env.update(zip(names, s.run(names, {i.name: env[i.name] for i in s.get_inputs()})))
            for key in list(env):
                if key not in self.need[k] and key != self.final:
                    del env[key]
            for j, key in enumerate(list(env)):  # park big tensors on disk until needed
                v = env[key]
                if isinstance(v, np.ndarray) and not isinstance(v, np.memmap) and v.nbytes > 8 << 20:
                    fn = self.workdir / f"t{k}_{j}.bin"
                    mm = np.memmap(fn, dtype=v.dtype, mode="w+", shape=v.shape)
                    mm[...] = v
                    mm.flush()
                    env[key] = np.memmap(fn, dtype=v.dtype, mode="r", shape=v.shape)
                    del v, mm
            gc.collect()
        y = np.asarray(env[self.final], np.float32).reshape(SIDE, SIDE)
        for f in self.workdir.glob("t*.bin"):
            f.unlink()
        return 1 / (1 + np.exp(-y))


def main() -> int:
    if not MODEL.exists():
        print(f"model not found at {MODEL}; see the header of this script", file=sys.stderr)
        return 1
    ids = sys.argv[1:] or sorted(p.stem for p in PORTRAITS.glob("*.webp") if not p.stem.endswith("-thumb"))
    OUT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        cutter = Cutter(split_model(MODEL, work), work)
        for cid in ids:
            t = time.time()
            im = Image.open(PORTRAITS / f"{cid}.webp").convert("RGB")
            m = cutter.mask(im)
            Image.fromarray((m * 255).astype(np.uint8)).resize(im.size, Image.BILINEAR).save(OUT / f"{cid}.png")
            print(f"{cid} {time.time() - t:.0f} s", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
