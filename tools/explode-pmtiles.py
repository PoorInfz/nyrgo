"""
Writes every tile of a PMTiles archive as a plain file, OUT/{z}/{x}/{y}.pbf (uncompressed MVT),
so the app can serve its basemap as ordinary static files (no range requests needed).

    python3 tools/explode-pmtiles.py cordoba.pmtiles apps/web/public/tiles/cordoba

Prints a JSON summary (tile count, bytes, zooms, bounds). The output folder is replaced.
"""
import gzip
import json
import shutil
import sys
from pathlib import Path

from pmtiles.reader import MmapSource, Reader, all_tiles
from pmtiles.tile import Compression


def main(src: str, out: str) -> None:
    dest = Path(out)
    if dest.exists():
        shutil.rmtree(dest)
    count = size = 0
    zooms: set[int] = set()
    with open(src, "rb") as f:
        source = MmapSource(f)
        header = Reader(source).header()
        gz = header["tile_compression"] == Compression.GZIP
        for (z, x, y), data in all_tiles(source):
            if gz:
                data = gzip.decompress(data)
            path = dest / str(z) / str(x) / f"{y}.pbf"
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
            count += 1
            size += len(data)
            zooms.add(z)
    bounds = [header[k] / 1e7 for k in ("min_lon_e7", "min_lat_e7", "max_lon_e7", "max_lat_e7")]
    print(json.dumps({"tiles": count, "bytes": size, "zooms": sorted(zooms), "bounds": bounds}))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
