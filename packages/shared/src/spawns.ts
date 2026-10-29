import type { Rarity } from './domain.js';
import { CREATURES, type Biome, type CreatureDef } from './content/creatures.js';
import type { SpawnConfig } from './config.js';

/**
 * Which creature fills a wild spawn slot. Shared by the API (which draws the random numbers
 * from a server secret) and the economy simulation, so both pick creatures the same way.
 */

const WILD = CREATURES.filter((c) => c.wild);

/** A rarity from the configured weights, for a uniform number in [0, 1). */
export function pickRarity(r: number, weights: Partial<Record<Rarity, number>>): Rarity {
  const entries = Object.entries(weights) as [Rarity, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let x = r * total;
  for (const [rarity, w] of entries) {
    if (x < w) return rarity;
    x -= w;
  }
  return entries[entries.length - 1]![0];
}

/** Wild creatures of a rarity that live in a biome; falls back to the whole rarity, then common. */
export function wildPool(rarity: Rarity, biome: Biome): CreatureDef[] {
  const local = WILD.filter((c) => c.rarity === rarity && c.biomes.includes(biome));
  if (local.length > 0) return local;
  const any = WILD.filter((c) => c.rarity === rarity);
  return any.length > 0 ? any : WILD.filter((c) => c.rarity === 'common');
}

/** The creature and level of one filled slot, from three uniform numbers. */
export function pickWild(
  cfg: SpawnConfig,
  biome: Biome,
  r: number,
  which: number,
  lv: number,
): { def: CreatureDef; level: number } {
  const candidates = wildPool(pickRarity(r, cfg.rarityWeights), biome);
  // weighted by stage when configured; equal weights give the same pick as a uniform choice
  const weight = (c: CreatureDef) => cfg.stageWeights?.[c.stage] ?? 1;
  const total = candidates.reduce((s, c) => s + weight(c), 0);
  let x = which * total;
  let def = candidates[candidates.length - 1]!;
  for (const c of candidates) {
    if (x < weight(c)) {
      def = c;
      break;
    }
    x -= weight(c);
  }
  const [min, max] = cfg.levelByStage[def.stage];
  return { def, level: min + Math.floor(lv * (max - min + 1)) };
}

/** The level a wild creature has when a player of `playerLevel` meets it. */
export function encounterLevel(cfg: SpawnConfig, spawnLevel: number, playerLevel: number): number {
  const above = cfg.wildLevelAbovePlayer;
  if (above === undefined || above === null) return spawnLevel;
  return Math.max(1, Math.min(spawnLevel, playerLevel + above));
}
