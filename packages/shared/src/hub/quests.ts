import { seededRandom } from '../random.js';

/**
 * The town's notice board: three small daily quests, picked per player and day, for things done
 * in the town. They pay a little Gold (inside the daily gameplay cap) and town XP (inside the
 * 50 % rule). Progress shares the missions table, with ids prefixed `hub:`.
 */
export type HubQuestKind =
  | 'train'
  | 'train_win'
  | 'ranked'
  | 'ranked_win'
  | 'emote'
  | 'visit_house'
  | 'market_list'
  | 'market_buy'
  | 'place_furniture'
  | 'tournament_join';

export interface HubQuestDef {
  id: string;
  kind: HubQuestKind;
  target: number;
  gold: number;
  xp: number;
}

const Q = (kind: HubQuestKind, target: number, gold: number, xp: number): HubQuestDef => ({
  id: `hub:${kind}:${target}`,
  kind,
  target,
  gold,
  xp,
});

export const HUB_QUESTS: HubQuestDef[] = [
  Q('train', 3, 30, 15),
  Q('train_win', 2, 40, 20),
  Q('ranked', 2, 40, 20),
  Q('ranked_win', 1, 50, 25),
  Q('emote', 3, 20, 10),
  Q('visit_house', 1, 30, 15),
  Q('market_list', 1, 30, 15),
  Q('market_buy', 1, 30, 15),
  Q('place_furniture', 2, 30, 15),
  Q('tournament_join', 1, 50, 20),
];

export const HUB_QUESTS_BY_ID = new Map(HUB_QUESTS.map((q) => [q.id, q]));
export const HUB_QUESTS_PER_DAY = 3;

/** The same three quests all day for a player, different ones the next day. */
export function dailyHubQuests(userId: string, day: string): HubQuestDef[] {
  const rand = seededRandom(`hub-quests:${userId}:${day}`);
  const pool = [...HUB_QUESTS];
  const picked: HubQuestDef[] = [];
  while (picked.length < HUB_QUESTS_PER_DAY && pool.length) {
    picked.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]!);
  }
  return picked;
}

/** The arena season a moment falls in: one per calendar month, UTC (`2026-11`). */
export function arenaSeason(at: Date = new Date()): string {
  return at.toISOString().slice(0, 7);
}

/** A rating carried into a new season: halfway back towards the start. */
export function seasonCarry(rating: number, start = 1000): number {
  return Math.round(start + (rating - start) / 2);
}

/**
 * Town achievements, worked out from what a player has done (nothing extra is stored). `stat`
 * names a count the server computes.
 */
export type AchievementStat =
  | 'trainings'
  | 'rankedWins'
  | 'sales'
  | 'purchases'
  | 'furniture'
  | 'quests'
  | 'tournaments'
  | 'tournamentWins'
  | 'bestSeasonRank';

export interface AchievementDef {
  id: string;
  stat: AchievementStat;
  /** Reached at this count (for `bestSeasonRank`: at this rank or better). */
  goal: number;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_training', stat: 'trainings', goal: 1 },
  { id: 'gym_regular', stat: 'trainings', goal: 50 },
  { id: 'first_ranked_win', stat: 'rankedWins', goal: 1 },
  { id: 'arena_veteran', stat: 'rankedWins', goal: 25 },
  { id: 'first_sale', stat: 'sales', goal: 1 },
  { id: 'merchant', stat: 'sales', goal: 20 },
  { id: 'first_purchase', stat: 'purchases', goal: 1 },
  { id: 'cosy_home', stat: 'furniture', goal: 10 },
  { id: 'notice_board', stat: 'quests', goal: 10 },
  { id: 'contender', stat: 'tournaments', goal: 1 },
  { id: 'champion', stat: 'tournamentWins', goal: 1 },
  { id: 'season_top10', stat: 'bestSeasonRank', goal: 10 },
];

/** Tournament prizes in Gold by final place (1st, 2nd, semi-finalists). */
export const TOURNAMENT_PRIZES = [300, 150, 75, 75];
