import { createHash, createHmac } from 'node:crypto';
import {
  CREATURES,
  type Biome,
  type CreatureDef,
  type Rarity,
  type SpawnConfig,
} from '@nyrgo/shared';

/**
 * Pure spawn generation. Given the server secret, a cell, its biome and centre, and the window,
 * the result is always the same, so every player sees the same creatures and a client without
 * the secret cannot predict them. The database decides afterwards which candidates are allowed
 * (inside the cell, outside exclusion zones).
 */

export interface CellInfo {
  cell: string;
  lat: number;
  lng: number;
  biome: Biome;
}

export interface SpawnCandidate {
  cell: string;
  slot: number;
  seed: bigint;
  definitionId: string;
  level: number;
  lat: number;
  lng: number;
}

/** Small fast PRNG (sfc32) seeded from four 32-bit words. Returns floats in [0, 1). */
export function sfc32(a: number, b: number, c: number, d: number): () => number {
  return () => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

/**
 * Each cell refreshes at its own offset inside the lifetime, so the map does not change all
 * at once. The offset only depends on the cell id (it is not secret).
 */
export function cellWindow(
  cell: string,
  nowMs: number,
  lifetimeMs: number,
): { start: number; end: number } {
  const offset = createHash('sha256').update(cell).digest().readUInt32BE(0) % lifetimeMs;
  const start = Math.floor((nowMs - offset) / lifetimeMs) * lifetimeMs + offset;
  return { start, end: start + lifetimeMs };
}

const wild = CREATURES.filter((c) => c.wild);

function pickRarity(r: number, weights: Partial<Record<Rarity, number>>): Rarity {
  const entries = Object.entries(weights) as [Rarity, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let x = r * total;
  for (const [rarity, w] of entries) {
    if (x < w) return rarity;
    x -= w;
  }
  return entries[entries.length - 1]![0];
}

/** Creatures of a rarity that live in a biome; falls back to the whole rarity, then to common. */
function pool(rarity: Rarity, biome: Biome): CreatureDef[] {
  const local = wild.filter((c) => c.rarity === rarity && c.biomes.includes(biome));
  if (local.length > 0) return local;
  const any = wild.filter((c) => c.rarity === rarity);
  return any.length > 0 ? any : wild.filter((c) => c.rarity === 'common');
}

const M_PER_DEG_LAT = 111_320;

export function generateCell(
  secret: string,
  info: CellInfo,
  windowStartMs: number,
  cfg: SpawnConfig,
): SpawnCandidate[] {
  const digest = createHmac('sha256', secret).update(`${info.cell}|${windowStartMs}`).digest();
  const rand = sfc32(
    digest.readUInt32BE(0),
    digest.readUInt32BE(4),
    digest.readUInt32BE(8),
    digest.readUInt32BE(12),
  );
  // A row id per slot; 48 bits from the digest, low 3 bits for the slot.
  const base = BigInt(digest.readUIntBE(16, 6)) << 3n;
  const out: SpawnCandidate[] = [];
  const slots = cfg.slotsByBiome[info.biome];
  for (let slot = 0; slot < slots; slot++) {
    // Draw every number for the slot even when it stays empty, so slots are independent.
    const present = rand();
    const r = rand();
    const which = rand();
    const lv = rand();
    const angle = rand() * 2 * Math.PI;
    const dist = Math.sqrt(rand()) * cfg.maxOffsetM;
    if (present >= cfg.slotChance) continue;
    const candidates = pool(pickRarity(r, cfg.rarityWeights), info.biome);
    const def = candidates[Math.floor(which * candidates.length)]!;
    const [min, max] = cfg.levelByStage[def.stage];
    out.push({
      cell: info.cell,
      slot,
      seed: base + BigInt(slot),
      definitionId: def.id,
      level: min + Math.floor(lv * (max - min + 1)),
      lat: info.lat + (Math.sin(angle) * dist) / M_PER_DEG_LAT,
      lng:
        info.lng +
        (Math.cos(angle) * dist) / (M_PER_DEG_LAT * Math.cos((info.lat * Math.PI) / 180)),
    });
  }
  return out;
}
