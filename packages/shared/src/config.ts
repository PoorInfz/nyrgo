import type { Rarity } from './domain.js';

/**
 * Default gameplay configuration (config version 1).
 * These are starting assumptions from the approved Phase 1 proposal, not tuned values.
 * In production the active config is loaded from the versioned `config_versions` table;
 * these defaults seed it and are what tests run against.
 */

export interface WorldConfig {
  /** H3 resolution used for spawns and POI lookup (~0.11 km² per cell). */
  spawnH3Resolution: number;
  /** H3 resolution used for regions and events. */
  regionH3Resolution: number;
  interactionRadiusM: number;
  visibleRadiusM: number;
  spawnLifetimeMin: number;
  /** Above this speed interactions are disabled (not punished). */
  maxRewardSpeedKmh: number;
  requiredAccuracyM: number;
  poiCooldownMin: number;
  /** Precise coordinates in location samples are nulled after this many hours. */
  preciseLocationRetentionH: number;
  /** Whole location sample rows are deleted after this many days. */
  locationSampleRetentionD: number;
  /** A POI is hidden pending review once this many different players report it. */
  poiHideAfterReports: number;
  /** Exclusion kinds that do not hide POIs (landmarks on bridges stay visible). */
  poiIgnoredExclusions: string[];
  /** Most POIs returned by one nearby query. */
  maxNearbyPois: number;
}

export interface EconomyConfig {
  dailyGameplayGoldCap: number;
  rarityXpMultiplier: Record<Rarity, number>;
  rewards: {
    captureSuccess: { xp: number; gold: number };
    captureFail: { xp: number; gold: number };
    poiInteract: {
      xp: number;
      goldMin: number;
      goldMax: number;
      itemsMin: number;
      itemsMax: number;
    };
    pveWin: { xp: number; gold: number; dailyCap: number };
    dailyMission: { xp: number; gold: number; perDay: number };
    newCell: { xp: number; gold: number; dailyCap: number };
    levelUpGoldPerLevel: number;
  };
  /** Target band for (gold earned / gold spent) of a regular player. */
  faucetSinkBand: { min: number; max: number };
}

export interface CaptureConfig {
  baseChance: Record<Rarity, number>;
  minChance: number;
  maxChance: number;
  /** Bonus per unit of throw skill score (score is 0..1). */
  skillBonus: number;
  /** Chance the creature runs away after each failed attempt. */
  fleeChance: Record<Rarity, number>;
  /** Minutes an encounter stays open after its spawn would have disappeared. */
  encounterGraceMin: number;
  /** Items every new player starts with. */
  starterKit: Record<string, number>;
  /** Level of the starter creature a player picks. */
  starterLevel: number;
}

/**
 * Wild spawns. Each H3 cell refreshes on its own schedule (offset by a hash of the cell) so
 * the whole map does not change at once. Generation is deterministic from a server secret,
 * the cell and the window, so every player sees the same creatures and clients cannot
 * predict them.
 */
export interface SpawnConfig {
  /** Spawn slots per cell by the cell's biome (the most common biome of its POIs). */
  slotsByBiome: Record<'urban' | 'park' | 'historic' | 'culture', number>;
  /** Each slot is filled with this probability. */
  slotChance: number;
  /** Relative weights of the rarities that appear in the wild. */
  rarityWeights: Partial<Record<Rarity, number>>;
  /** Level range by evolution stage. */
  levelByStage: Record<1 | 2 | 3, [number, number]>;
  /** Spawns are placed at most this far from their cell centre (r9 cells are ~150 m across the flats). */
  maxOffsetM: number;
  /** Rings of neighbouring cells searched around the player's cell. */
  searchRings: number;
}

/**
 * Server-side movement checks. They only ever pause interactions or raise risk for human
 * review; nothing here bans a player (master prompt §16: no bans on a single anomaly).
 */
export interface AntiCheatConfig {
  /** Implied speed above this between two fixes counts as a jump, not travel. */
  teleportSpeedKmh: number;
  /** ...but only when the jump is at least this far (short GPS glitches are ignored). */
  teleportMinDistanceM: number;
  /** Interactions stay paused this long after a jump. */
  teleportLockMin: number;
  /** Fixes closer in time than this are too noisy to derive a speed from. */
  minSpeedIntervalS: number;
  /** Client clock further than this from the server clock is a (weak) signal. */
  clockSkewToleranceS: number;
  /** Identical accuracy on this many consecutive fixes suggests a mock location app. */
  constantAccuracyRun: number;
  /** Risk score at which an account is queued for manual review. */
  reviewThreshold: number;
  /** Signals lose half their weight every this many hours. */
  riskHalfLifeH: number;
}

export interface GameConfig {
  version: number;
  world: WorldConfig;
  economy: EconomyConfig;
  capture: CaptureConfig;
  spawns: SpawnConfig;
  antiCheat: AntiCheatConfig;
}

export const DEFAULT_CONFIG: GameConfig = {
  version: 1,
  world: {
    spawnH3Resolution: 9,
    regionH3Resolution: 7,
    interactionRadiusM: 40,
    visibleRadiusM: 300,
    spawnLifetimeMin: 15,
    maxRewardSpeedKmh: 30,
    requiredAccuracyM: 50,
    poiCooldownMin: 5,
    preciseLocationRetentionH: 24,
    locationSampleRetentionD: 30,
    poiHideAfterReports: 3,
    poiIgnoredExclusions: ['water'],
    maxNearbyPois: 100,
  },
  economy: {
    dailyGameplayGoldCap: 1500,
    rarityXpMultiplier: { common: 1, uncommon: 1.5, rare: 2, epic: 3, legendary: 4, mythic: 5 },
    rewards: {
      captureSuccess: { xp: 100, gold: 10 },
      captureFail: { xp: 10, gold: 0 },
      poiInteract: { xp: 25, goldMin: 20, goldMax: 40, itemsMin: 2, itemsMax: 4 },
      pveWin: { xp: 150, gold: 25, dailyCap: 20 },
      dailyMission: { xp: 500, gold: 150, perDay: 3 },
      newCell: { xp: 50, gold: 5, dailyCap: 20 },
      levelUpGoldPerLevel: 20,
    },
    faucetSinkBand: { min: 0.9, max: 1.2 },
  },
  antiCheat: {
    teleportSpeedKmh: 150,
    teleportMinDistanceM: 500,
    teleportLockMin: 5,
    minSpeedIntervalS: 2,
    clockSkewToleranceS: 120,
    constantAccuracyRun: 20,
    reviewThreshold: 70,
    riskHalfLifeH: 72,
  },
  capture: {
    baseChance: {
      common: 0.6,
      uncommon: 0.4,
      rare: 0.25,
      epic: 0.12,
      legendary: 0.06,
      mythic: 0.03,
    },
    minChance: 0.02,
    maxChance: 0.95,
    skillBonus: 0.25,
    fleeChance: {
      common: 0.1,
      uncommon: 0.15,
      rare: 0.2,
      epic: 0.25,
      legendary: 0.3,
      mythic: 0.35,
    },
    encounterGraceMin: 2,
    starterKit: { 'vault-basic': 15, patch: 3 },
    starterLevel: 5,
  },
  spawns: {
    slotsByBiome: { urban: 1, park: 3, historic: 2, culture: 2 },
    slotChance: 0.6,
    rarityWeights: { common: 62, uncommon: 25, rare: 10, epic: 3 },
    levelByStage: { 1: [2, 10], 2: [10, 22], 3: [22, 35] },
    maxOffsetM: 110,
    searchRings: 2,
  },
};

/**
 * Capture probability, computed server-side only.
 * p = clamp(base[rarity] * itemMultiplier * levelFactor * (1 + skillBonus * skill), min, max)
 */
export function captureChance(
  cfg: CaptureConfig,
  rarity: Rarity,
  itemMultiplier: number,
  levelFactor: number,
  skillScore: number,
): number {
  const skill = Math.min(1, Math.max(0, skillScore));
  const raw = cfg.baseChance[rarity] * itemMultiplier * levelFactor * (1 + cfg.skillBonus * skill);
  return Math.min(cfg.maxChance, Math.max(cfg.minChance, raw));
}
