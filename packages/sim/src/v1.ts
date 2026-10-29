import { currentTuning, type Tuning } from './model.js';

/**
 * Config version 1 (the Phase 1 starting assumptions), rebuilt from the current values by
 * putting back every number the Phase 2 tuning changed. The report compares both.
 */
export interface Change {
  key: string;
  before: string;
  after: string;
  why: string;
}

type Entry = {
  key: string;
  why: string;
  get: (t: Tuning) => unknown;
  /** Puts the version 1 value back. */
  v1: (t: Tuning) => void;
};

const ENTRIES: Entry[] = [
  {
    key: 'spawns.stageWeights',
    why: 'Among creatures of the same rarity, evolved forms were as likely as first forms; now they are the exception. (Together with the level limit below.)',
    get: (t) => t.config.spawns.stageWeights ?? 'all equal',
    v1: (t) => delete t.config.spawns.stageWeights,
  },
  {
    key: 'spawns.wildLevelAbovePlayer',
    why: 'Evolved wild creatures come at levels 10–35, so a new player could catch a level-30 creature on day one. Now each player meets a wild creature at most 3 levels above their own: catching does not skip progression and fights stay fair.',
    get: (t) => t.config.spawns.wildLevelAbovePlayer ?? null,
    v1: (t) => (t.config.spawns.wildLevelAbovePlayer = null),
  },
  {
    key: 'spawns.rarityWeights',
    why: 'Rare and epic finds a little rarer, so the Dex stays a goal past the first month.',
    get: (t) => t.config.spawns.rarityWeights,
    v1: (t) => (t.config.spawns.rarityWeights = { common: 62, uncommon: 25, rare: 10, epic: 3 }),
  },
  {
    key: 'capture.baseChance (rare, epic)',
    why: 'Rare and epic creatures were caught in under two throws on average.',
    get: (t) => [t.config.capture.baseChance.rare, t.config.capture.baseChance.epic],
    v1: (t) => {
      t.config.capture.baseChance.rare = 0.25;
      t.config.capture.baseChance.epic = 0.12;
    },
  },
  {
    key: 'economy.dailyGameplayGoldCap',
    why: 'With the lower rewards nobody reached 1,500 a day, so the cap protected nothing; at 500 it only stops long farming sessions (and bots), never a regular player.',
    get: (t) => t.config.economy.dailyGameplayGoldCap,
    v1: (t) => (t.config.economy.dailyGameplayGoldCap = 1500),
  },
  {
    key: 'rewards.levelUpGoldPerLevel',
    why: 'Level-up gold grew with the level (20 × L) and was the largest single source of gold.',
    get: (t) => t.config.economy.rewards.levelUpGoldPerLevel,
    v1: (t) => (t.config.economy.rewards.levelUpGoldPerLevel = 20),
  },
  {
    key: 'rewards.dailyMission (xp, gold)',
    why: 'Missions alone gave 1,500 XP a day (the regular player reached level 30 in under a month) and were the second largest source of gold.',
    get: (t) => [
      t.config.economy.rewards.dailyMission.xp,
      t.config.economy.rewards.dailyMission.gold,
    ],
    v1: (t) => {
      t.config.economy.rewards.dailyMission.xp = 500;
      t.config.economy.rewards.dailyMission.gold = 150;
    },
  },
  {
    key: 'rewards.captureSuccess (xp, gold)',
    why: 'XP and gold per catch, with the rarity multiplier on the XP.',
    get: (t) => [
      t.config.economy.rewards.captureSuccess.xp,
      t.config.economy.rewards.captureSuccess.gold,
    ],
    v1: (t) => (t.config.economy.rewards.captureSuccess = { xp: 100, gold: 10 }),
  },
  {
    key: 'rewards.pveWin (xp, gold)',
    why: 'XP and gold per rewarded win (still 20 a day).',
    get: (t) => [t.config.economy.rewards.pveWin.xp, t.config.economy.rewards.pveWin.gold],
    v1: (t) => {
      t.config.economy.rewards.pveWin.xp = 150;
      t.config.economy.rewards.pveWin.gold = 25;
    },
  },
  {
    key: 'rewards.poiInteract (xp, gold, items)',
    why: 'Places are visited often: their gold added up fastest for long sessions, and they gave more vaults than players could throw, so nobody needed the shop.',
    get: (t) => {
      const p = t.config.economy.rewards.poiInteract;
      return [p.xp, `${p.goldMin}–${p.goldMax}`, `${p.itemsMin}–${p.itemsMax}`];
    },
    v1: (t) =>
      (t.config.economy.rewards.poiInteract = {
        xp: 25,
        goldMin: 20,
        goldMax: 40,
        itemsMin: 2,
        itemsMax: 4,
      }),
  },
  {
    key: 'economy.poiLoot (basic vault, each material)',
    why: 'Fewer free vaults so the shop matters; twice the evolution materials so evolving is not stuck waiting for drops.',
    get: (t) => [t.config.economy.poiLoot['vault-basic'], t.config.economy.poiLoot['hash-shard']],
    v1: (t) => {
      const l = t.config.economy.poiLoot;
      l['vault-basic'] = 50;
      for (const m of ['hash-shard', 'moon-dust', 'vault-frost', 'yield-seed']) l[m] = 3;
    },
  },
  {
    key: 'rewards.newCell.gold',
    why: 'Not implemented in the API yet; lowered so the capped daily rewards (battles, missions, new cells) still fit under the new 500 cap.',
    get: (t) => t.config.economy.rewards.newCell.gold,
    v1: (t) => (t.config.economy.rewards.newCell.gold = 5),
  },
  {
    key: 'economy.creatureBattleXp',
    why: 'A creature needed ~65 wins to reach its evolution level, so level evolutions almost never happened; about 3.5 times the XP brings the first one into the first two weeks.',
    get: (t) => t.config.economy.creatureBattleXp,
    v1: (t) => (t.config.economy.creatureBattleXp = { base: 20, perFoeLevel: 6 }),
  },
];

export function configV1(): { tuning: Tuning; changes: Change[] } {
  const now = currentTuning();
  const old = currentTuning();
  for (const e of ENTRIES) e.v1(old);
  old.config.version = 1;
  const show = (x: unknown) => (typeof x === 'string' ? x : JSON.stringify(x));
  return {
    tuning: old,
    changes: ENTRIES.map((e) => ({
      key: e.key,
      before: show(e.get(old)),
      after: show(e.get(now)),
      why: e.why,
    })),
  };
}
