/**
 * Imports POIs and exclusion zones from OpenStreetMap for a bounding box (default: Córdoba).
 *
 *   pnpm --filter @nyrgo/api world:import                      # fetch from Overpass and load
 *   pnpm --filter @nyrgo/api world:import --save osm.json      # also keep the raw response
 *   pnpm --filter @nyrgo/api world:import --file osm.json      # load a saved response offline
 *   pnpm --filter @nyrgo/api world:import --dry-run            # classify and report only
 *   pnpm --filter @nyrgo/api world:import --bbox 37.85,-4.85,37.92,-4.72
 *
 * Paths are relative to apps/api. Needs DATABASE_URL (except with --dry-run).
 * OVERPASS_URL overrides the public endpoint.
 * Data © OpenStreetMap contributors, ODbL 1.0.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { createDb } from '../src/db.js';
import { loadWorld } from '../src/modules/world/load.js';
import {
  CORDOBA_BBOX,
  classifyElements,
  fetchOverpass,
  type BBox,
  type OverpassResponse,
} from '../src/modules/world/osm.js';

const { values } = parseArgs({
  options: {
    file: { type: 'string' },
    save: { type: 'string' },
    bbox: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
});

function parseBbox(s: string | undefined): BBox {
  if (!s) return CORDOBA_BBOX;
  const [south, west, north, east] = s.split(',').map(Number);
  if ([south, west, north, east].some((n) => n === undefined || !Number.isFinite(n))) {
    throw new Error('--bbox must be south,west,north,east');
  }
  return { south: south!, west: west!, north: north!, east: east! };
}

const bbox = parseBbox(values.bbox);
const raw: OverpassResponse = values.file
  ? (JSON.parse(await readFile(values.file, 'utf8')) as OverpassResponse)
  : await fetchOverpass(bbox, process.env.OVERPASS_URL ? [process.env.OVERPASS_URL] : undefined);
if (values.save) {
  await mkdir(dirname(values.save), { recursive: true });
  await writeFile(values.save, JSON.stringify(raw));
  console.warn(`saved raw response to ${values.save}`);
}

const classified = classifyElements(raw);
const byKind = (xs: { kind: string }[]) =>
  Object.entries(
    xs.reduce<Record<string, number>>(
      (acc, x) => ({ ...acc, [x.kind]: (acc[x.kind] ?? 0) + 1 }),
      {},
    ),
  ).sort((a, b) => b[1] - a[1]);

console.warn(`elements: ${raw.elements.length}, skipped: ${classified.skipped}`);
console.warn(`POIs: ${classified.pois.length}`, byKind(classified.pois));
console.warn(`exclusion zones: ${classified.exclusions.length}`, byKind(classified.exclusions));

if (!values['dry-run']) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  const db = createDb(url);
  try {
    const result = await loadWorld(db, bbox, classified);
    console.warn('loaded', result);
  } finally {
    await db.end();
  }
}
