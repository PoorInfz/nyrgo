import type { Element } from './domain.js';
import { effectiveness } from './content/elements.js';
import { PASSIVES_BY_ID, type Passive } from './content/passives.js';
import { SKILLS_BY_ID } from './content/skills.js';
import { ITEMS_BY_ID } from './content/items.js';
import type { Stats } from './content/creatures.js';

/**
 * Turn-based 1v1 combat. Pure and deterministic: the same state, action and random source give
 * the same result. The server owns the random source (seeded per battle and turn) and stores
 * every turn; the client only ever sends an action.
 */

export type Side = 'player' | 'foe';
type ModStat = 'atk' | 'def' | 'spd';

export interface Fighter {
  creatureId: string;
  element: Element;
  level: number;
  maxHp: number;
  hp: number;
  /** Stats at this level, before battle modifiers. */
  stats: Stats;
  /** Battle multipliers, 1 = unchanged. */
  mods: Record<ModStat, number>;
  skills: string[];
  passive: string;
  /** One-shot passive state. */
  used: { survive?: boolean; halve?: boolean; immunity?: boolean; taxed?: boolean };
}

export interface BattleState {
  turn: number;
  player: Fighter;
  foe: Fighter;
  /** Healing items the player can still use in this battle. */
  items: Record<string, number>;
  result: null | 'win' | 'loss' | 'fled';
}

export type Action =
  { kind: 'skill'; skill: string } | { kind: 'item'; item: string } | { kind: 'flee' };

export type BattleEvent =
  | { type: 'passive'; side: Side; passive: string; stat?: string | undefined; amount?: number }
  | { type: 'resist'; side: Side; passive: string }
  | { type: 'move'; side: Side; skill: string }
  | { type: 'miss'; side: Side }
  | { type: 'dodge'; side: Side }
  | {
      type: 'hit';
      side: Side;
      damage: number;
      effectiveness: number;
      crit: boolean;
      hpLeft: number;
    }
  | { type: 'heal'; side: Side; amount: number; source: 'item' | 'passive' | 'drain' }
  | { type: 'recoil'; side: Side; amount: number }
  | { type: 'tax'; side: Side; amount: number }
  | { type: 'survive'; side: Side }
  | { type: 'faint'; side: Side }
  | { type: 'item'; side: Side; item: string }
  | { type: 'flee'; success: boolean };

export const COMBAT = {
  /** Damage scale: power × atk/def × this × (1 + level/25). Tuned for ~5 hits at equal level. */
  damageScale: 0.13,
  /**
   * How much of the type chart reaches the damage: multiplier^typeWeight. In a 1v1 without
   * switching, the full ×2 / ×0.5 (a ×4 swing) decided every fight; 0.5 gives ×1.41 / ×0.71.
   */
  typeWeight: 0.5,
  /** Same-element bonus. */
  stab: 1.2,
  critChance: 0.06,
  critMultiplier: 1.5,
  /** Random spread: damage × [spreadMin, 1]. */
  spreadMin: 0.85,
  /** Self-damage of recoil_power, as a fraction of max HP. */
  recoilFraction: 0.05,
  /** HP fraction under which flee_bonus speeds up and execute applies. */
  lowHp: 0.3,
  executeBelow: 1 / 3,
  fleeBase: 0.5,
  fleeMin: 0.25,
  fleeMax: 0.95,
  /** The wild foe picks its best move this often, otherwise a random one. */
  foeSmartness: 0.7,
  /** A battle cannot last forever. */
  maxTurns: 50,
} as const;

const other = (s: Side): Side => (s === 'player' ? 'foe' : 'player');
const passiveOf = (f: Fighter): Passive | undefined => PASSIVES_BY_ID.get(f.passive);

export function createFighter(opts: {
  creatureId: string;
  element: Element;
  level: number;
  stats: Stats;
  skills: string[];
  passive: string;
  hp?: number;
}): Fighter {
  return {
    creatureId: opts.creatureId,
    element: opts.element,
    level: opts.level,
    maxHp: opts.stats.hp,
    hp: Math.min(opts.stats.hp, Math.max(0, opts.hp ?? opts.stats.hp)),
    stats: opts.stats,
    mods: { atk: 1, def: 1, spd: 1 },
    skills: opts.skills,
    passive: opts.passive,
    used: {},
  };
}

/** Speed used for turn order, including speed passives at low HP. */
export function effectiveSpeed(f: Fighter): number {
  const p = passiveOf(f);
  let spd = f.stats.spd * f.mods.spd;
  if (p?.effect === 'flee_bonus' && f.hp < f.maxHp * COMBAT.lowHp) spd *= 1 + p.value;
  return spd;
}

/** Applies start-of-battle passives (stat bonuses, debuffs on the foe, random buffs). */
export function startBattle(
  player: Fighter,
  foe: Fighter,
  items: Record<string, number>,
  rand: () => number,
): { state: BattleState; events: BattleEvent[] } {
  const state: BattleState = { turn: 0, player, foe, items: { ...items }, result: null };
  const events: BattleEvent[] = [];
  for (const side of ['player', 'foe'] as const) {
    const me = state[side];
    const p = passiveOf(me);
    if (!p) continue;
    if (p.effect === 'stat_bonus') {
      const stats: ModStat[] = p.stat === 'all' ? ['atk', 'def', 'spd'] : [p.stat as ModStat];
      for (const s of stats) me.mods[s] *= 1 + p.value;
      events.push({ type: 'passive', side, passive: p.id, stat: p.stat, amount: p.value });
    }
    if (p.effect === 'random_buff') {
      const s = (['atk', 'def', 'spd'] as const)[Math.floor(rand() * 3)]!;
      me.mods[s] *= 1 + p.value;
      events.push({ type: 'passive', side, passive: p.id, stat: s, amount: p.value });
    }
  }
  for (const side of ['player', 'foe'] as const) {
    const p = passiveOf(state[side]);
    if (p?.effect !== 'enemy_debuff') continue;
    const target = state[other(side)];
    const tp = passiveOf(target);
    if (tp?.effect === 'debuff_immunity' && !target.used.immunity) {
      target.used.immunity = true;
      events.push({ type: 'resist', side: other(side), passive: tp.id });
      continue;
    }
    target.mods[p.stat as ModStat] *= 1 - p.value;
    events.push({ type: 'passive', side, passive: p.id, stat: p.stat, amount: -p.value });
  }
  return { state, events };
}

/** Expected value of a skill against a target, used by the wild foe. */
function skillScore(user: Fighter, target: Fighter, skillId: string): number {
  const s = SKILLS_BY_ID.get(skillId)!;
  const stab = s.element === user.element ? COMBAT.stab : 1;
  return s.power * effectiveness(s.element, target.element) * stab * (s.accuracy / 100);
}

/** The wild creature's choice: usually its best move, sometimes any move. */
export function foeAction(state: BattleState, rand: () => number): Action {
  const { foe, player } = state;
  if (rand() < COMBAT.foeSmartness) {
    const best = [...foe.skills].sort(
      (a, b) => skillScore(foe, player, b) - skillScore(foe, player, a),
    )[0]!;
    return { kind: 'skill', skill: best };
  }
  return { kind: 'skill', skill: foe.skills[Math.floor(rand() * foe.skills.length)]! };
}

/** Chance to flee from a wild creature. */
export function fleeChance(state: BattleState): number {
  const ratio = effectiveSpeed(state.player) / Math.max(1, effectiveSpeed(state.foe));
  const p = passiveOf(state.player);
  const bonus = p?.effect === 'flee_bonus' ? p.value : 0;
  return Math.min(COMBAT.fleeMax, Math.max(COMBAT.fleeMin, COMBAT.fleeBase * ratio + bonus));
}

function damage(
  attacker: Fighter,
  target: Fighter,
  skillId: string,
  rand: () => number,
): { amount: number; eff: number; crit: boolean } {
  const s = SKILLS_BY_ID.get(skillId)!;
  const ap = passiveOf(attacker);
  const tp = passiveOf(target);
  const eff = effectiveness(s.element, target.element);
  const atk = attacker.stats.atk * attacker.mods.atk;
  const def = Math.max(1, target.stats.def * target.mods.def);
  let dmg = s.power * (atk / def) * COMBAT.damageScale * (1 + attacker.level / 25);
  dmg *= eff ** COMBAT.typeWeight;
  if (s.element === attacker.element) dmg *= COMBAT.stab;
  const crit = rand() < COMBAT.critChance;
  if (crit) dmg *= COMBAT.critMultiplier;
  dmg *= COMBAT.spreadMin + rand() * (1 - COMBAT.spreadMin);
  if (ap?.effect === 'recoil_power') dmg *= 1 + ap.value;
  if (ap?.effect === 'execute' && target.hp < target.maxHp * COMBAT.executeBelow)
    dmg *= 1 + ap.value;
  if (tp?.effect === 'resist_super' && eff > 1) dmg *= 1 - tp.value;
  return { amount: Math.max(1, Math.round(dmg)), eff, crit };
}

/** Takes `amount` from `target`, honouring halve_once and survive_once. Returns damage dealt. */
function applyDamage(
  state: BattleState,
  side: Side,
  amount: number,
  events: BattleEvent[],
): number {
  const target = state[side];
  const tp = passiveOf(target);
  let dmg = amount;
  if (tp?.effect === 'halve_once' && !target.used.halve) {
    target.used.halve = true;
    dmg = Math.max(1, Math.round(dmg / 2));
    events.push({ type: 'passive', side, passive: tp.id });
  }
  if (tp?.effect === 'survive_once' && !target.used.survive && dmg >= target.hp && target.hp > 1) {
    target.used.survive = true;
    dmg = target.hp - 1;
    events.push({ type: 'survive', side });
  }
  const dealt = Math.min(target.hp, dmg);
  target.hp -= dealt;
  return dealt;
}

function useSkill(
  state: BattleState,
  side: Side,
  skillId: string,
  rand: () => number,
  events: BattleEvent[],
): void {
  const me = state[side];
  const foeSide = other(side);
  const target = state[foeSide];
  const p = passiveOf(me);
  const tp = passiveOf(target);
  const s = SKILLS_BY_ID.get(skillId)!;
  events.push({ type: 'move', side, skill: skillId });

  // The target's toll: the first attack against it costs the attacker.
  if (tp?.effect === 'first_hit_tax' && !target.used.taxed) {
    target.used.taxed = true;
    const tax = Math.max(1, Math.round(me.maxHp * tp.value));
    me.hp = Math.max(0, me.hp - tax);
    events.push({ type: 'tax', side, amount: tax });
    if (me.hp === 0) return;
  }

  const strikes = p?.effect === 'double_hit' && rand() < p.value ? 2 : 1;
  for (let i = 0; i < strikes && target.hp > 0; i++) {
    const hits = p?.effect === 'never_miss' || rand() * 100 < s.accuracy;
    if (!hits) {
      events.push({ type: 'miss', side });
      continue;
    }
    if (tp?.effect === 'evasion' && rand() < tp.value) {
      events.push({ type: 'dodge', side: foeSide });
      continue;
    }
    const d = damage(me, target, skillId, rand);
    const dealt = applyDamage(state, foeSide, d.amount, events);
    events.push({
      type: 'hit',
      side,
      damage: dealt,
      effectiveness: d.eff,
      crit: d.crit,
      hpLeft: target.hp,
    });
    if (p?.effect === 'drain' && dealt > 0) {
      const heal = Math.min(me.maxHp - me.hp, Math.max(1, Math.round(dealt * p.value)));
      if (heal > 0) {
        me.hp += heal;
        events.push({ type: 'heal', side, amount: heal, source: 'drain' });
      }
    }
    if (p?.effect === 'recoil_power') {
      const recoil = Math.max(1, Math.round(me.maxHp * COMBAT.recoilFraction));
      const taken = Math.min(me.hp - (me.hp > 1 ? 1 : 0), recoil);
      // recoil never knocks out its own user
      if (taken > 0) {
        me.hp -= taken;
        events.push({ type: 'recoil', side, amount: taken });
      }
    }
  }
}

function useItem(state: BattleState, itemId: string, events: BattleEvent[]): void {
  const me = state.player;
  const item = ITEMS_BY_ID.get(itemId)!;
  state.items[itemId] = (state.items[itemId] ?? 0) - 1;
  const heal = Math.min(me.maxHp - me.hp, item.effects.heal ?? 0);
  me.hp += heal;
  events.push({ type: 'item', side: 'player', item: itemId });
  events.push({ type: 'heal', side: 'player', amount: heal, source: 'item' });
}

/** Why an action cannot be taken right now, or null if it can. */
export function invalidAction(state: BattleState, action: Action): string | null {
  if (state.result) return 'battle_over';
  if (action.kind === 'skill' && !state.player.skills.includes(action.skill))
    return 'unknown_skill';
  if (action.kind === 'item') {
    const item = ITEMS_BY_ID.get(action.item);
    if (!item || item.kind !== 'heal') return 'not_usable';
    if ((state.items[action.item] ?? 0) <= 0) return 'out_of_items';
  }
  return null;
}

/**
 * Resolves one turn. Fleeing and items go first; otherwise the faster creature moves first.
 * Returns a new state (the input is not modified) and what happened, in order.
 */
export function resolveTurn(
  input: BattleState,
  action: Action,
  rand: () => number,
): { state: BattleState; events: BattleEvent[] } {
  const why = invalidAction(input, action);
  if (why) throw new Error(why);
  // the state is plain JSON (it is stored as jsonb), so a JSON round trip is a full copy
  const state = JSON.parse(JSON.stringify(input)) as BattleState;
  const events: BattleEvent[] = [];
  state.turn += 1;

  if (action.kind === 'flee') {
    const ok = rand() < fleeChance(state);
    events.push({ type: 'flee', success: ok });
    if (ok) {
      state.result = 'fled';
      return { state, events };
    }
  }

  // The wild foe only ever uses skills.
  const foeSkill = (foeAction(state, rand) as { kind: 'skill'; skill: string }).skill;
  const order: Side[] = [];
  if (action.kind === 'skill') {
    const ps = effectiveSpeed(state.player);
    const fs = effectiveSpeed(state.foe);
    const playerFirst = ps > fs || (ps === fs && rand() < 0.5);
    order.push(...(playerFirst ? (['player', 'foe'] as const) : (['foe', 'player'] as const)));
  } else {
    if (action.kind === 'item') useItem(state, action.item, events);
    order.push('foe');
  }

  for (const side of order) {
    const me = state[side];
    if (me.hp <= 0 || state.player.hp <= 0 || state.foe.hp <= 0) break;
    const skill = side === 'player' ? (action as { skill: string }).skill : foeSkill;
    useSkill(state, side, skill, rand, events);
  }

  // End of turn: regeneration and speed ramps for whoever is still standing.
  if (state.player.hp > 0 && state.foe.hp > 0) {
    for (const side of ['player', 'foe'] as const) {
      const me = state[side];
      const p = passiveOf(me);
      if (!p) continue;
      if (p.effect === 'regen' && me.hp < me.maxHp) {
        const heal = Math.min(me.maxHp - me.hp, Math.max(1, Math.round(me.maxHp * p.value)));
        me.hp += heal;
        events.push({ type: 'heal', side, amount: heal, source: 'passive' });
      }
      if (p.effect === 'speed_ramp') me.mods.spd *= 1 + p.value;
      if (p.effect === 'wait_speed' && order[0] !== side) me.mods.spd *= 1 + p.value;
    }
  }

  if (state.foe.hp <= 0) {
    events.push({ type: 'faint', side: 'foe' });
    state.result = 'win';
  } else if (state.player.hp <= 0) {
    events.push({ type: 'faint', side: 'player' });
    state.result = 'loss';
  } else if (state.turn >= COMBAT.maxTurns) {
    state.result = 'fled';
  }
  return { state, events };
}

/** One turn of a duel, as both players see it. */
export interface DuelTurn {
  turn: number;
  events: BattleEvent[];
}

export interface DuelResult {
  /** `player` is the challenger, `foe` the friend who accepted. */
  winner: Side | null;
  turns: DuelTurn[];
  /** HP left on each side at the end. */
  hp: { player: number; foe: number };
}

/**
 * A friendly duel between two players' creatures, fought by the game: each side picks moves the
 * way a wild creature does. Deterministic for a given seed, so the result can be replayed.
 */
export function simulateDuel(challenger: Fighter, friend: Fighter, rand: () => number): DuelResult {
  const start = startBattle(challenger, friend, {}, rand);
  let state = start.state;
  const turns: DuelTurn[] = [{ turn: 0, events: start.events }];
  while (!state.result) {
    // the challenger's move, chosen as if it were the wild side
    const mirror: BattleState = { ...state, player: state.foe, foe: state.player };
    const action = foeAction(mirror, rand);
    const next = resolveTurn(state, action, rand);
    state = next.state;
    turns.push({ turn: state.turn, events: next.events });
  }
  const winner = state.result === 'win' ? 'player' : state.result === 'loss' ? 'foe' : null;
  return { winner, turns, hp: { player: state.player.hp, foe: state.foe.hp } };
}
