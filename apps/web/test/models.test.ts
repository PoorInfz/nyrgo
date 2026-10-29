import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Box3, Mesh, type Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CREATURES } from '@nyrgo/shared';
import { creatureGlb, creatureParts } from '../src/models/creature';

// Tests run from apps/web (jsdom gives import.meta.url an http: scheme).
const dir = resolve(process.cwd(), 'public/creatures') + '/';

function parse(bytes: Uint8Array): Promise<Object3D> {
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new Promise((resolve, reject) =>
    new GLTFLoader().parse(buf as ArrayBuffer, '', (g) => resolve(g.scene), reject),
  );
}

describe('placeholder models', () => {
  it('has a committed model for every creature, identical to the generator output', () => {
    for (const c of CREATURES) {
      const committed = readFileSync(`${dir}${c.id}.glb`);
      expect(
        Buffer.compare(committed, Buffer.from(creatureGlb(c))),
        `${c.id}.glb is stale: run models:gen`,
      ).toBe(0);
    }
  });

  it('loads every model with the three.js glTF loader, resting on the ground', async () => {
    for (const c of CREATURES) {
      const scene = await parse(creatureGlb(c));
      let meshes = 0;
      scene.traverse((o) => {
        if (o instanceof Mesh) meshes++;
      });
      expect(meshes, c.id).toBeGreaterThan(0);
      const bb = new Box3().setFromObject(scene);
      expect(bb.min.y, c.id).toBeGreaterThanOrEqual(-0.01);
      expect(bb.min.y, c.id).toBeLessThan(0.1);
      expect(bb.max.y - bb.min.y, c.id).toBeGreaterThan(0.5);
      expect(bb.max.y - bb.min.y, c.id).toBeLessThan(4);
    }
  });

  it('grows with each evolution stage', async () => {
    const height = async (id: string) => {
      const c = CREATURES.find((x) => x.id === id)!;
      const bb = new Box3().setFromObject(await parse(creatureGlb(c)));
      return bb.max.y - bb.min.y;
    };
    const [a, b, c] = await Promise.all(['gwisp', 'gasguzzle', 'gaswarlord'].map(height));
    expect(b).toBeGreaterThan(a!);
    expect(c).toBeGreaterThan(b!);
  });

  it('marks rarity with a ring or a crown', () => {
    const golds = (id: string) =>
      creatureParts(CREATURES.find((x) => x.id === id)!).filter((p) => p.material.metallic === 0.7)
        .length;
    expect(golds('gwisp')).toBe(0);
    expect(golds('leviawhale')).toBe(1); // epic ring
    expect(golds('genesaur')).toBe(6); // 5 spikes + band
    expect(golds('zeroknowl')).toBe(8); // 7 spikes + band
  });

  it('gives every creature two eyes', () => {
    for (const c of CREATURES) {
      const pupils = creatureParts(c).filter((p) => p.material.color[0] === 0.05);
      expect(pupils, c.id).toHaveLength(2);
    }
  });
});
