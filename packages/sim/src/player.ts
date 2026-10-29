import {
  CREATURES_BY_ID,
  REST_HEAL,
  STARTERS,
  ITEMS_BY_ID,
  SKILLS_BY_ID,
  battleXp,
  captureChance,
  captureFactor,
  createFighter,
  creatureLevelForXp,
  creatureXpForLevel,
  dailyMissions,
  encounterLevel,
  effectiveness,
  evolutionBlock,
  instanceStats,
  levelForXp,
  missionStep,
  pickWild,
  resolveTurn,
  rollPoiLoot,
  startBattle,
  weaknessFactor,
  type Action,
  type BattleState,
  type Biome,
  type CreatureDef,
  type Ivs,
  type MissionDef,
  type Rarity,
  type Stats,
} from '@nyrgo/shared';
import type { Archetype, Tuning, WorldModel } from './model.js';

/** Gold sources and sinks, named like the API's ledger reasons. */
export type GoldIn = 'capture' | 'poi_visit' | 'pve_win' | 'mission' | 'level_up';
export type GoldOut = 'shop' | 'craft' | 'evolution';

export interface DayStats {
  day: number;
  played: boolean;
  goldIn: Record<GoldIn, number>;
  goldOut: Record<GoldOut, number>;
  /** Gold the daily cap kept from the player. */
  goldCapped: number;
  goldBalance: number;
  level: number;
  xp: number;
  /** Different creatures caught so far. */
  dexCaught: number;
  collection: number;
  encounters: number;
  throws: number;
  captures: number;
  fled: number;
  /** Encounters skipped with no vault to throw. */
  noVault: number;
  battlesWon: number;
  battlesLost: number;
  evolutions: number;
  missionsDone: number;
  bestCreatureLevel: number;
}

interface Owned {
  def: CreatureDef;
  level: number;
  xp: number;
  ivs: Ivs;
  hp: number;
  /** Day it joined the collection (for the HODL evolutions). */
  since: number;
}

const WILD_IVS: Ivs = { hp: 7, atk: 7, def: 7, spd: 7 };
const RARITY_ORDER: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
const HEAL_ITEMS = ['patch-secure', 'patch'];

const zeroIn = (): Record<GoldIn, number> => ({
  capture: 0,
  poi_visit: 0,
  pve_win: 0,
  mission: 0,
  level_up: 0,
});
const zeroOut = (): Record<GoldOut, number> => ({ shop: 0, craft: 0, evolution: 0 });

function poisson(rand: () => number, mean: number): number {
  // Knuth; means here are small (< 40)
  const l = Math.exp(-mean);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rand();
  } while (p > l);
  return k - 1;
}

function pickBiome(rand: () => number, mix: Record<Biome, number>): Biome {
  const entries = Object.entries(mix) as [Biome, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let x = rand() * total;
  for (const [b, w] of entries) {
    if (x < w) return b;
    x -= w;
  }
  return entries[0]![0];
}

const statsOf = (o: Owned): Stats => instanceStats(o.def.stats, o.level, o.ivs);

/**
 * One simulated player. The rules are the game's own (`@nyrgo/shared`); the choices are a simple,
 * sensible policy: shop when low on vaults, fight when a creature is strong enough, use the
 * best vault on rare finds, evolve as soon as it can afford it.
 */
export class SimPlayer {
  xp = 0;
  level = 1;
  gold = 0;
  items: Record<string, number>;
  owned: Owned[] = [];
  caught = new Set<string>();
  days: DayStats[] = [];

  private today!: DayStats;
  private earnedToday = 0;
  private rewardedWins = 0;
  private missions: { def: MissionDef; progress: number; claimed: boolean }[] = [];

  constructor(
    readonly id: string,
    readonly archetype: Archetype,
    readonly tuning: Tuning,
    readonly world: WorldModel,
    private readonly rand: () => number,
  ) {
    const cap = tuning.config.capture;
    this.items = { ...cap.starterKit };
    const starter = STARTERS[Math.floor(rand() * STARTERS.length)]!;
    this.addCreature(starter, cap.starterLevel, 0);
  }

  // ------------------------------------------------------------------ rewards and ledger

  /** The API's grantReward: XP always, gold and level-up gold up to the daily cap. */
  private reward(xp: number, gold: number, reason: GoldIn) {
    const eco = this.tuning.config.economy;
    this.xp += xp;
    const level = Math.max(this.level, levelForXp(this.xp));
    let levelGold = 0;
    for (let l = this.level + 1; l <= level; l++) levelGold += eco.rewards.levelUpGoldPerLevel * l;
    this.level = level;
    let room = Math.max(0, eco.dailyGameplayGoldCap - this.earnedToday);
    for (const [amount, why] of [
      [gold, reason],
      [levelGold, 'level_up'],
    ] as const) {
      const paid = Math.min(amount, room);
      room -= paid;
      this.earnedToday += paid;
      this.gold += paid;
      this.today.goldIn[why] += paid;
      this.today.goldCapped += amount - paid;
    }
  }

  private spend(amount: number, why: GoldOut): boolean {
    if (amount > this.gold) return false;
    this.gold -= amount;
    this.today.goldOut[why] += amount;
    return true;
  }

  private bump(event: Parameters<typeof missionStep>[1]) {
    const m = this.tuning.config.economy.rewards.dailyMission;
    for (const mission of this.missions) {
      if (mission.claimed) continue;
      mission.progress += missionStep(mission.def, event);
      if (mission.progress >= mission.def.target) {
        mission.claimed = true;
        this.today.missionsDone++;
        this.reward(m.xp, m.gold, 'mission');
      }
    }
  }

  private addCreature(def: CreatureDef, level: number, day: number) {
    const r = this.rand;
    const iv = () => Math.floor(r() * 16);
    const ivs = { hp: iv(), atk: iv(), def: iv(), spd: iv() };
    const o: Owned = { def, level, xp: creatureXpForLevel(level), ivs, hp: 0, since: day };
    o.hp = statsOf(o).hp;
    this.owned.push(o);
    this.caught.add(def.id);
  }

  // ------------------------------------------------------------------ a day

  playDay(day: number) {
    this.today = {
      day,
      played: false,
      goldIn: zeroIn(),
      goldOut: zeroOut(),
      goldCapped: 0,
      goldBalance: 0,
      level: 0,
      xp: 0,
      dexCaught: 0,
      collection: 0,
      encounters: 0,
      throws: 0,
      captures: 0,
      fled: 0,
      noVault: 0,
      battlesWon: 0,
      battlesLost: 0,
      evolutions: 0,
      missionsDone: 0,
      bestCreatureLevel: 0,
    };
    this.earnedToday = 0;
    this.rewardedWins = 0;
    // overnight every creature is rested
    for (const o of this.owned) o.hp = statsOf(o).hp;

    const plays = this.rand() < this.archetype.daysPerWeek / 7;
    if (plays) {
      this.today.played = true;
      const eco = this.tuning.config.economy;
      this.missions = dailyMissions(this.id, `d${day}`, eco).map((def) => ({
        def,
        progress: 0,
        claimed: false,
      }));
      this.shop();
      this.session(day);
      this.craft();
      this.evolve(day);
      this.shop();
    }

    const t = this.today;
    t.goldBalance = this.gold;
    t.level = this.level;
    t.xp = this.xp;
    t.dexCaught = this.caught.size;
    t.collection = this.owned.length;
    t.bestCreatureLevel = Math.max(...this.owned.map((o) => o.level));
    this.days.push(t);
  }

  private session(day: number) {
    const w = this.world;
    const hours = this.archetype.minutesPerDay / 60;
    const events: ('enc' | 'poi')[] = [];
    for (let i = poisson(this.rand, w.encountersPerHour * hours); i > 0; i--) events.push('enc');
    for (let i = poisson(this.rand, w.placesPerHour * hours); i > 0; i--) events.push('poi');
    for (let i = events.length - 1; i > 0; i--) {
      const j = Math.floor(this.rand() * (i + 1));
      [events[i], events[j]] = [events[j]!, events[i]!];
    }
    // walking time between events, during which creatures recover
    const gap = events.length > 0 ? this.archetype.minutesPerDay / events.length : 0;
    for (const e of events) {
      this.rest(gap);
      if (e === 'poi') this.visit();
      else this.encounter(day);
    }
  }

  private rest(minutes: number) {
    const heal = REST_HEAL.fraction * (minutes / REST_HEAL.minutes);
    for (const o of this.owned) {
      const max = statsOf(o).hp;
      o.hp = Math.min(max, o.hp + Math.round(max * heal));
    }
  }

  private visit() {
    const r = this.tuning.config.economy.rewards.poiInteract;
    const loot = rollPoiLoot(this.rand, this.tuning.config.economy);
    for (const [id, n] of Object.entries(loot.items)) this.items[id] = (this.items[id] ?? 0) + n;
    this.reward(r.xp, loot.gold, 'poi_visit');
    this.bump({ kind: 'visit' });
  }

  // ------------------------------------------------------------------ encounters

  private encounter(day: number) {
    this.today.encounters++;
    const cfg = this.tuning.config;
    const biome = pickBiome(this.rand, this.world.biomeMix);
    const spawn = pickWild(cfg.spawns, biome, this.rand(), this.rand(), this.rand());
    const def = spawn.def;
    const level = encounterLevel(cfg.spawns, spawn.level, this.level);

    // Common duplicates the player already has plenty of are left alone.
    const copies = this.owned.filter((o) => o.def.id === def.id).length;
    if (def.rarity === 'common' && copies >= 4) return;

    const foeStats = instanceStats(def.stats, level, WILD_IVS);
    let foeHp = foeStats.hp;
    if (this.archetype.battles) {
      const fighter = this.pickFighter(def, level);
      if (fighter) foeHp = this.battle(fighter, def, level, foeStats);
    }
    this.capture(def, level, foeHp, foeStats.hp, day);
  }

  /**
   * Who fights: a strong-enough creature (within 3 levels of the foe, at least half HP). Like a
   * real player, it trains the creature it is working towards evolving, else it sends its best.
   */
  private pickFighter(foe: CreatureDef, foeLevel: number): Owned | null {
    const goal = this.trainee();
    if (goal) this.patchUp(goal);
    const ok = this.owned.filter((o) => o.level >= foeLevel - 3 && o.hp >= statsOf(o).hp * 0.5);
    if (ok.length === 0) return null;
    if (goal && ok.includes(goal)) return goal;
    const score = (o: Owned) =>
      o.level + 4 * Math.log2(effectiveness(o.def.element, foe.element)) + o.hp / 1000;
    return ok.sort((a, b) => score(b) - score(a))[0]!;
  }

  /** Heals a creature with patches outside battle (the API's heal route), keeping two spare. */
  private patchUp(o: Owned) {
    const max = statsOf(o).hp;
    for (const id of HEAL_ITEMS) {
      const heal = ITEMS_BY_ID.get(id)!.effects.heal ?? 0;
      while (o.hp < max * 0.5 && (this.items[id] ?? 0) > 2) {
        this.items[id]!--;
        o.hp = Math.min(max, o.hp + heal);
      }
    }
  }

  /** The creature closest to a level-based evolution. */
  private trainee(): Owned | null {
    let best: Owned | null = null;
    let gap = Infinity;
    for (const o of this.owned) {
      const lvl = o.def.evolution?.level;
      if (lvl === null || lvl === undefined) continue;
      const g = lvl - o.level;
      if (g > 0 && g < gap) {
        gap = g;
        best = o;
      }
    }
    return best;
  }

  /** A real battle on the game's engine. Returns the foe's HP afterwards. */
  private battle(mine: Owned, foe: CreatureDef, foeLevel: number, foeStats: Stats): number {
    const player = createFighter({
      creatureId: mine.def.id,
      element: mine.def.element,
      level: mine.level,
      stats: statsOf(mine),
      skills: mine.def.skills,
      passive: mine.def.passive,
      hp: mine.hp,
    });
    const wild = createFighter({
      creatureId: foe.id,
      element: foe.element,
      level: foeLevel,
      stats: foeStats,
      skills: foe.skills,
      passive: foe.passive,
    });
    const heal: Record<string, number> = {};
    for (const id of HEAL_ITEMS) if (this.items[id]) heal[id] = this.items[id]!;
    let { state } = startBattle(player, wild, heal, this.rand);
    let turns = 0;
    while (!state.result && turns < 60) {
      turns++;
      // the engine plays the wild creature's move inside the same turn
      state = resolveTurn(state, this.playerAction(state), this.rand).state;
    }
    for (const id of HEAL_ITEMS) if (heal[id] !== undefined) this.items[id] = state.items[id] ?? 0;
    mine.hp = state.player.hp;
    this.rest(turns * this.world.battleMinutesPerTurn);
    const eco = this.tuning.config.economy;
    if (state.result === 'win') {
      this.today.battlesWon++;
      mine.xp += battleXp(foeLevel, eco);
      mine.level = Math.max(mine.level, creatureLevelForXp(mine.xp));
      this.bump({ kind: 'win' });
      if (this.rewardedWins < eco.rewards.pveWin.dailyCap) {
        this.rewardedWins++;
        this.reward(eco.rewards.pveWin.xp, eco.rewards.pveWin.gold, 'pve_win');
      }
    } else {
      this.today.battlesLost++;
    }
    return state.foe.hp;
  }

  private playerAction(state: BattleState): Action {
    const me = state.player;
    if (me.hp < me.maxHp * 0.3 && state.foe.hp > state.foe.maxHp * 0.25) {
      for (const id of HEAL_ITEMS)
        if ((state.items[id] ?? 0) > 0) return { kind: 'item', item: id };
    }
    const value = (id: string) => {
      const s = SKILLS_BY_ID.get(id)!;
      const stab = s.element === me.element ? 1.2 : 1;
      return (
        s.power * effectiveness(s.element, state.foe.element) ** 0.5 * stab * (s.accuracy / 100)
      );
    };
    const best = [...me.skills].sort((a, b) => value(b) - value(a))[0]!;
    return { kind: 'skill', skill: best };
  }

  private capture(def: CreatureDef, level: number, foeHp: number, foeMax: number, day: number) {
    const cap = this.tuning.config.capture;
    const eco = this.tuning.config.economy;
    const rarityRank = RARITY_ORDER.indexOf(def.rarity);
    for (let attempt = 0; attempt < 8; attempt++) {
      const vault = this.chooseVault(rarityRank);
      if (!vault) {
        this.today.noVault++;
        return;
      }
      this.items[vault]!--;
      this.today.throws++;
      const skill = Math.min(1, Math.max(0, this.archetype.skill + (this.rand() - 0.5) * 0.4));
      const chance = captureChance(
        cap,
        def.rarity,
        ITEMS_BY_ID.get(vault)!.effects.captureMultiplier ?? 1,
        captureFactor(def.captureDifficulty, level) * weaknessFactor(foeHp, foeMax),
        skill,
      );
      const success = this.rand() < chance;
      const fled = !success && this.rand() < cap.fleeChance[def.rarity];
      const base = success ? eco.rewards.captureSuccess : eco.rewards.captureFail;
      this.reward(Math.round(base.xp * eco.rarityXpMultiplier[def.rarity]), base.gold, 'capture');
      this.bump({ kind: 'throw' });
      if (success) {
        this.today.captures++;
        this.addCreature(def, level, day);
        this.bump({ kind: 'catch', creatureId: def.id });
        return;
      }
      if (fled) {
        this.today.fled++;
        return;
      }
    }
  }

  /** Best vault for rare finds; basic ones for the rest, falling back to anything left. */
  private chooseVault(rarityRank: number): string | null {
    const order =
      rarityRank >= 2
        ? ['vault-cold', 'vault-reinforced', 'vault-basic']
        : rarityRank === 1
          ? ['vault-basic', 'vault-reinforced', 'vault-cold']
          : ['vault-basic', 'vault-reinforced'];
    return order.find((id) => (this.items[id] ?? 0) > 0) ?? null;
  }

  // ------------------------------------------------------------------ spending

  /** Keeps a working stock: vaults first (needed to play), then patches. */
  private shop() {
    const p = this.tuning.prices;
    const buy = (id: string, upTo: number, keepGold: number) => {
      const price = p[id];
      if (price === undefined) return;
      while ((this.items[id] ?? 0) < upTo && this.gold - price >= keepGold) {
        this.spend(price, 'shop');
        this.items[id] = (this.items[id] ?? 0) + 1;
      }
    };
    buy('vault-basic', 12, 0);
    buy('patch', 3, 100);
    if (this.level >= 8) buy('vault-reinforced', 3, 400);
  }

  private craft() {
    for (const r of this.tuning.recipes) {
      if (this.level < r.unlockLevel) continue;
      // materials are kept for evolutions; only a surplus goes into crafting
      const surplus = Object.entries(r.inputs).every(([id, n]) => {
        const isMaterial = ITEMS_BY_ID.get(id)?.kind === 'material';
        return (this.items[id] ?? 0) >= n + (isMaterial ? 6 : 0);
      });
      if (!surplus || this.gold < r.gold + 100) continue;
      if (!this.spend(r.gold, 'craft')) continue;
      for (const [id, n] of Object.entries(r.inputs)) this.items[id]! -= n;
      this.items[r.output] = (this.items[r.output] ?? 0) + 1;
    }
  }

  private evolve(day: number) {
    for (const o of [...this.owned].sort((a, b) => b.level - a.level)) {
      const evo = o.def.evolution;
      if (!evo || evolutionBlock(o.def, o.level, day - o.since) !== null) continue;
      const stage = o.def.stage as 1 | 2;
      const gold = this.tuning.evolutionGold[stage];
      const material = Object.keys(evo.materials)[0]!;
      const need = this.tuning.evolutionMaterials[stage];
      if ((this.items[material] ?? 0) < need || this.gold < gold) continue;
      this.spend(gold, 'evolution');
      this.items[material]! -= need;
      o.def = CREATURES_BY_ID.get(evo.to)!;
      o.hp = statsOf(o).hp;
      this.caught.add(o.def.id);
      this.today.evolutions++;
    }
  }
}
