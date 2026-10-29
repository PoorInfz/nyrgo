import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CREATURES, ELEMENTS } from '@nyrgo/shared';

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

/** Canvas size and alpha flag from a WebP's extended (VP8X) header. */
function webpInfo(bytes: Buffer) {
  expect(bytes.subarray(12, 16).toString('latin1')).toBe('VP8X');
  return {
    alpha: (bytes[20]! & 0x10) !== 0,
    width: 1 + bytes.readUIntLE(24, 3),
    height: 1 + bytes.readUIntLE(27, 3),
  };
}

describe('battle sprites', () => {
  const sprites = join(process.cwd(), 'public', 'sprites');
  const fx = join(process.cwd(), 'public', 'fx');

  it('ships an idle and an attack sheet for every creature, and nothing else', () => {
    const expected = CREATURES.flatMap((c) => [
      `${c.id}-attack.webp`,
      `${c.id}-cut.webp`,
      `${c.id}-idle.webp`,
    ]).sort();
    expect(readdirSync(sprites).sort()).toEqual(expected);
  });

  it('lays the frames out as the battle styles expect, on a transparent background', () => {
    for (const f of readdirSync(sprites)) {
      const bytes = readFileSync(join(sprites, f));
      if (f.endsWith('-cut.webp')) {
        expect(webpInfo(bytes), f).toEqual({ alpha: true, width: 112, height: 128 });
        continue;
      }
      const frames = f.endsWith('-idle.webp') ? 6 : 5;
      expect(webpInfo(bytes), f).toEqual({ alpha: true, width: 224 * frames, height: 256 });
      expect(bytes.length, f).toBeLessThan(120_000);
    }
  });

  it('ships an 8-frame effect for every element', () => {
    const expected = ELEMENTS.map((e) => `${e}.webp`).sort();
    expect(readdirSync(fx).sort()).toEqual(expected);
    for (const f of expected) {
      const bytes = readFileSync(join(fx, f));
      expect(webpInfo(bytes), f).toEqual({ alpha: true, width: 192 * 8, height: 192 });
      expect(bytes.length, f).toBeLessThan(120_000);
    }
  });
});
