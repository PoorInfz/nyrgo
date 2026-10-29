/**
 * Writes one placeholder GLB per creature to apps/web/public/creatures/<id>.glb.
 * Deterministic: re-running it on unchanged content produces identical files, and a test
 * fails if the committed files drift from the generator.
 *
 *   pnpm --filter @nyrgo/web models:gen
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { CREATURES } from '@nyrgo/shared';
import { creatureGlb } from '../src/models/creature';

const dir = fileURLToPath(new URL('../public/creatures/', import.meta.url));
await mkdir(dir, { recursive: true });
let bytes = 0;
for (const c of CREATURES) {
  const glb = creatureGlb(c);
  bytes += glb.byteLength;
  await writeFile(`${dir}${c.id}.glb`, glb);
}
console.warn(`wrote ${CREATURES.length} models, ${(bytes / 1024).toFixed(0)} KB total, to ${dir}`);
