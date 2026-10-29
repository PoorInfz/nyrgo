import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CREATURES } from '@nyrgo/shared';
import { DRAWINGS, creatureSvg } from '../src/art/creatures';

// jsdom gives import.meta.url an http: scheme, so resolve from the package root instead
const dir = join(process.cwd(), 'public', 'creatures');

describe('creature art', () => {
  it('has a drawing for every creature and nothing else', () => {
    expect(Object.keys(DRAWINGS).sort()).toEqual(CREATURES.map((c) => c.id).sort());
  });

  it('ships exactly the generated files (run `pnpm --filter @nyrgo/web art:gen` after changing art)', () => {
    expect(readdirSync(dir).sort()).toEqual(CREATURES.map((c) => `${c.id}.svg`).sort());
    for (const c of CREATURES) {
      const file = readFileSync(join(dir, `${c.id}.svg`), 'utf8');
      expect(file, c.id).toBe(creatureSvg(c.id, c.name, c.rarity));
    }
  });

  it('produces well-formed, self-contained SVG titled with the creature name', () => {
    const parser = new DOMParser();
    for (const c of CREATURES) {
      const text = creatureSvg(c.id, c.name, c.rarity);
      const doc = parser.parseFromString(text, 'image/svg+xml');
      expect(doc.getElementsByTagName('parsererror'), c.id).toHaveLength(0);
      expect(doc.documentElement.getAttribute('viewBox')).toBe('0 0 256 256');
      expect(doc.querySelector('title')?.textContent).toBe(c.name);
      // nothing that loads or runs anything: no scripts, images, foreign objects or URLs
      expect(text, c.id).not.toMatch(
        /<script|<image|<foreignObject|href=|https?:\/\/(?!www\.w3\.org\/2000\/svg)/,
      );
      expect(text.length, c.id).toBeLessThan(24_000);
    }
  });

  it('uses ids that are unique and prefixed per creature, so portraits can be inlined together', () => {
    const all = new Set<string>();
    for (const c of CREATURES) {
      const ids = [...creatureSvg(c.id, c.name, c.rarity).matchAll(/ id="([^"]+)"/g)].map(
        (m) => m[1]!,
      );
      for (const id of ids) {
        expect(id.startsWith(`${c.id}-`), `${c.id}: ${id}`).toBe(true);
        expect(all.has(id), `duplicate ${id}`).toBe(false);
        all.add(id);
      }
      // every url(#…) reference points at an id in the same document
      for (const m of creatureSvg(c.id, c.name, c.rarity).matchAll(/url\(#([^)]+)\)/g)) {
        expect(ids, `${c.id} references ${m[1]}`).toContain(m[1]);
      }
    }
  });

  it('is deterministic', () => {
    for (const c of CREATURES)
      expect(creatureSvg(c.id, c.name, c.rarity)).toBe(creatureSvg(c.id, c.name, c.rarity));
  });

  it('adds more sparkles for rarer creatures', () => {
    const count = (id: string) => {
      const c = CREATURES.find((x) => x.id === id)!;
      const all = creatureSvg(c.id, c.name, c.rarity);
      const plain = creatureSvg(c.id, c.name, 'common');
      return all.length - plain.length;
    };
    expect(count('gwisp')).toBe(0);
    expect(count('ruglet')).toBeGreaterThan(0);
    expect(count('zeroknowl')).toBeGreaterThan(count('leviawhale'));
  });
});
