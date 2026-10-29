import type { Element } from './domain.js';
import { ELEMENTS } from './domain.js';
import { CREATURES_BY_ID, type CreatureDef } from './content/creatures.js';
import { ELEMENT_INFO } from './content/elements.js';
import { DEFAULT_CONFIG, type EconomyConfig } from './config.js';
import { seededRandom } from './random.js';

/**
 * Economy rules shared by the API (authoritative) and the client (display): what places give,
 * the daily missions, and when a creature can evolve.
 */

/** Relative weights of the items a place can give (the active config's). */
export const POI_LOOT: Record<string, number> = DEFAULT_CONFIG.economy.poiLoot;

export interface Loot {
  gold: number;
  items: Record<string, number>;
}

/** What one visit to a place gives, from a random source the server owns. */
export function rollPoiLoot(
  rand: () => number,
  economy: EconomyConfig = DEFAULT_CONFIG.economy,
): Loot {
  const r = economy.rewards.poiInteract;
  const gold = r.goldMin + Math.floor(rand() * (r.goldMax - r.goldMin + 1));
  const count = r.itemsMin + Math.floor(rand() * (r.itemsMax - r.itemsMin + 1));
  const entries = Object.entries(economy.poiLoot);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  const items: Record<string, number> = {};
  for (let i = 0; i < count; i++) {
    let x = rand() * total;
    for (const [id, w] of entries) {
      if (x < w) {
        items[id] = (items[id] ?? 0) + 1;
        break;
      }
      x -= w;
    }
  }
  return { gold, items };
}

export type MissionKind = 'catch' | 'catch_element' | 'win' | 'visit' | 'throw';

export interface MissionDef {
  id: string;
  kind: MissionKind;
  target: number;
  element?: Element;
  name: { es: string; en: string };
}

const M = (
  id: string,
  kind: MissionKind,
  target: number,
  es: string,
  en: string,
  element?: Element,
): MissionDef =>
  element
    ? { id, kind, target, element, name: { es, en } }
    : { id, kind, target, name: { es, en } };

/** The pool daily missions are drawn from. */
export const MISSIONS: MissionDef[] = [
  M('catch-3', 'catch', 3, 'Captura 3 criaturas', 'Catch 3 creatures'),
  M('catch-5', 'catch', 5, 'Captura 5 criaturas', 'Catch 5 creatures'),
  M('win-2', 'win', 2, 'Gana 2 combates', 'Win 2 battles'),
  M('win-4', 'win', 4, 'Gana 4 combates', 'Win 4 battles'),
  M('visit-3', 'visit', 3, 'Visita 3 lugares', 'Visit 3 places'),
  M('visit-6', 'visit', 6, 'Visita 6 lugares', 'Visit 6 places'),
  M('throw-10', 'throw', 10, 'Lanza 10 bóvedas', 'Throw 10 vaults'),
  ...ELEMENTS.map((e) =>
    M(
      `catch-${e}`,
      'catch_element',
      1,
      `Captura una criatura de ${ELEMENT_INFO[e].es}`,
      `Catch a ${ELEMENT_INFO[e].en} creature`,
      e,
    ),
  ),
];

export const MISSIONS_BY_ID: ReadonlyMap<string, MissionDef> = new Map(
  MISSIONS.map((m) => [m.id, m]),
);

/**
 * Today's missions for a player: the same three all day, different kinds, chosen from the
 * player id and the date (a calendar day in the game's time zone, `YYYY-MM-DD`).
 */
export function dailyMissions(
  userId: string,
  day: string,
  economy: EconomyConfig = DEFAULT_CONFIG.economy,
): MissionDef[] {
  const rand = seededRandom(`missions:${userId}:${day}`);
  const pool = [...MISSIONS];
  const picked: MissionDef[] = [];
  const kinds = new Set<MissionKind>();
  while (picked.length < economy.rewards.dailyMission.perDay && pool.length > 0) {
    const m = pool.splice(Math.floor(rand() * pool.length), 1)[0]!;
    // one mission per kind (catching any creature and one of an element count as different)
    if (kinds.has(m.kind)) continue;
    kinds.add(m.kind);
    picked.push(m);
  }
  return picked;
}

/** How much a game event moves a mission forward. */
export function missionStep(
  m: MissionDef,
  event:
    { kind: 'catch'; creatureId: string } | { kind: 'win' } | { kind: 'visit' } | { kind: 'throw' },
): number {
  if (m.kind === 'catch_element') {
    return event.kind === 'catch' && CREATURES_BY_ID.get(event.creatureId)?.element === m.element
      ? 1
      : 0;
  }
  return m.kind === event.kind ? 1 : 0;
}

export type EvolveBlock = 'no_evolution' | 'level' | 'hold_days';

/**
 * Whether an owned creature meets its evolution conditions (costs are checked separately).
 * `heldDays` is how long it has been in the collection.
 */
export function evolutionBlock(
  def: CreatureDef,
  level: number,
  heldDays: number,
): EvolveBlock | null {
  const evo = def.evolution;
  if (!evo) return 'no_evolution';
  if (evo.level !== null && level < evo.level) return 'level';
  if (evo.holdDays !== null && heldDays < evo.holdDays) return 'hold_days';
  return null;
}
