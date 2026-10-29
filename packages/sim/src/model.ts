import {
  DEFAULT_CONFIG,
  ITEMS,
  RECIPES,
  type Biome,
  type GameConfig,
  type RecipeDef,
} from '@nyrgo/shared';

/**
 * Everything the simulation assumes about the world and the players, in one place, so the report
 * can print it and a reader can disagree with a number rather than with the code.
 */

/** How a kind of player plays. */
export interface Archetype {
  id: string;
  /** Spanish label for the report. */
  label: string;
  /** Days a week the player opens the game. */
  daysPerWeek: number;
  /** Minutes walking with the game open on a day they play. */
  minutesPerDay: number;
  /** Mean throw skill (0..1) and its spread. */
  skill: number;
  /** Battles a wild creature before throwing when it has a creature strong enough. */
  battles: boolean;
}

export const ARCHETYPES: Archetype[] = [
  {
    id: 'casual',
    label: 'Casual',
    daysPerWeek: 3,
    minutesPerDay: 20,
    skill: 0.35,
    battles: false,
  },
  {
    id: 'regular',
    label: 'Habitual',
    daysPerWeek: 6,
    minutesPerDay: 45,
    skill: 0.5,
    battles: true,
  },
  {
    id: 'dedicated',
    label: 'Dedicado',
    daysPerWeek: 7,
    minutesPerDay: 90,
    skill: 0.6,
    battles: true,
  },
  {
    id: 'grinder',
    label: 'Intensivo',
    daysPerWeek: 7,
    minutesPerDay: 180,
    skill: 0.7,
    battles: true,
  },
];

/** The city as a walker meets it. */
export interface WorldModel {
  /** Wild creatures a player can reach per hour of walking (spawns along and near the route). */
  encountersPerHour: number;
  /** Place visits per hour (each place has a cooldown; routes pass several). */
  placesPerHour: number;
  /** Share of spawn cells of each biome along a typical route in central Córdoba. */
  biomeMix: Record<Biome, number>;
  /** Minutes one encounter takes (approach, throws); a battle adds this much per turn. */
  encounterMinutes: number;
  battleMinutesPerTurn: number;
}

/**
 * Derivation of the defaults: an H3 r9 cell is ~0.105 km² (~320 m across). Walking at 4.5 km/h
 * crosses ~14 cells an hour; with the configured slots (urban 1, park 3, historic 2, culture 2)
 * at 60 % fill and this biome mix, a cell holds ~1.0 spawns per 15-minute window, and about
 * 70 % of those are close enough to the route to reach: ~10 an hour. Places: the historic centre
 * has a landmark every ~100–200 m on a typical walk; 6 visits an hour leaves room for the 5-minute
 * cooldown and for streets without landmarks.
 */
export const DEFAULT_WORLD: WorldModel = {
  encountersPerHour: 10,
  placesPerHour: 6,
  biomeMix: { urban: 0.45, historic: 0.3, park: 0.15, culture: 0.1 },
  encounterMinutes: 1.5,
  battleMinutesPerTurn: 0.15,
};

/**
 * The tunable numbers. Most live in the versioned game config; shop prices, recipes and
 * evolution costs live in content and are mirrored here so a run can change them.
 */
export interface Tuning {
  config: GameConfig;
  prices: Record<string, number>;
  recipes: RecipeDef[];
  /** Gold an evolution costs, by the stage evolving (1 → 2, 2 → 3). */
  evolutionGold: Record<1 | 2, number>;
  /** Materials an evolution costs, by the stage evolving. */
  evolutionMaterials: Record<1 | 2, number>;
}

export function currentTuning(): Tuning {
  return {
    config: structuredClone(DEFAULT_CONFIG),
    prices: Object.fromEntries(ITEMS.filter((i) => i.price !== null).map((i) => [i.id, i.price!])),
    recipes: structuredClone(RECIPES),
    evolutionGold: { 1: 500, 2: 1000 },
    evolutionMaterials: { 1: 3, 2: 6 },
  };
}
