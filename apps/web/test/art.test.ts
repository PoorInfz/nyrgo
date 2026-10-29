import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CREATURES } from '@nyrgo/shared';

// jsdom gives import.meta.url an http: scheme, so resolve from the package root instead
const dir = join(process.cwd(), 'public', 'creatures');

describe('creature art', () => {
  it('ships a portrait and a thumbnail for every creature, and nothing else', () => {
    const expected = CREATURES.flatMap((c) => [`${c.id}.webp`, `${c.id}-thumb.webp`]).sort();
    expect(readdirSync(dir).sort()).toEqual(expected);
  });

  it('ships real WebP files of a sensible size', () => {
    for (const f of readdirSync(dir)) {
      const bytes = readFileSync(join(dir, f));
      expect(bytes.subarray(0, 4).toString('latin1'), f).toBe('RIFF');
      expect(bytes.subarray(8, 12).toString('latin1'), f).toBe('WEBP');
      const limit = f.endsWith('-thumb.webp') ? 30_000 : 160_000;
      expect(bytes.length, f).toBeLessThan(limit);
      expect(bytes.length, f).toBeGreaterThan(2_000);
    }
  });
});
