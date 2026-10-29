/**
 * Writes one SVG portrait per creature to apps/web/public/creatures/<id>.svg.
 * Deterministic: re-running it on unchanged art produces identical files, and a test fails if
 * the committed files drift from the drawings in src/art.
 *
 *   pnpm --filter @nyrgo/web art:gen
 */
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { CREATURES } from '@nyrgo/shared';
import { creatureSvg } from '../src/art/creatures';

const dir = fileURLToPath(new URL('../public/creatures/', import.meta.url));
await mkdir(dir, { recursive: true });
// remove files for creatures or formats that no longer exist
const keep = new Set(CREATURES.map((c) => `${c.id}.svg`));
for (const f of await readdir(dir)) if (!keep.has(f)) await rm(`${dir}${f}`);
let bytes = 0;
for (const c of CREATURES) {
  const svg = creatureSvg(c.id, c.name, c.rarity);
  bytes += Buffer.byteLength(svg);
  await writeFile(`${dir}${c.id}.svg`, svg);
}
console.warn(
  `wrote ${CREATURES.length} portraits, ${(bytes / 1024).toFixed(0)} KB total, to ${dir}`,
);
