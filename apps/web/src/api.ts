import type {
  AgeBand,
  AvatarLook,
  ProgressBreakdown,
  BattleEvent,
  Element,
  ErrorCode,
  Evolution,
  ItemDef,
  Passive,
  Rarity,
  RecipeDef,
  Skill,
  Stats,
} from '@nyrgo/shared';
import type { LocationFix } from './geo/location';
import type { MapPoi } from './map/style';

export interface Profile {
  id: string;
  kind: 'guest' | 'registered';
  email: string | null;
  ageBand: AgeBand;
  region: string | null;
  displayName: string;
  level: number;
  xp: number;
  gold: number;
  canUseWeb3: boolean;
  createdAt: string;
}

export interface Movement {
  speedKmh: number | null;
  interactable: boolean;
  reason: 'speed' | 'teleport_cooldown' | 'mock_location' | null;
  lockedUntil: string | null;
}

export interface NearbyCreature {
  /** The spawn id. */
  id: string;
  creatureId: string;
  level: number;
  lat: number;
  lng: number;
  distanceM: number;
  expiresAt: string;
  inRange: boolean;
  /** Set when the creature is there for a scheduled event. */
  eventId?: string | null;
}

export interface Nearby {
  cell: string;
  movement: Movement;
  visibleRadiusM: number;
  interactionRadiusM: number;
  attribution: string;
  /** `loading`: the server is fetching this place from OpenStreetMap; creatures come after. */
  area?: 'ready' | 'loading';
  pois: MapPoi[];
  creatures: NearbyCreature[];
}

export interface InventoryItem {
  id: string;
  qty: number;
}

export interface Encounter {
  id: string;
  spawnId: string;
  creatureId: string;
  level: number;
  rarity: Rarity;
  status: 'open' | 'caught' | 'fled';
  attempts: number;
  expiresAt: string;
  inventory: InventoryItem[];
  /** Null until a battle has started; 0 once worn out (easiest to capture). */
  foeHp: number | null;
  foeMaxHp: number | null;
  worn: boolean;
}

export interface BattleSide {
  creatureId: string;
  level: number;
  hp: number;
  maxHp: number;
  skills: string[];
  passive: string;
  mods: { atk: number; def: number; spd: number };
}

export interface BattleView {
  id: string;
  turn: number;
  result: null | 'win' | 'loss' | 'fled';
  player: BattleSide;
  foe: BattleSide;
  items: Record<string, number>;
  events: BattleEvent[];
  reward?: CaptureResult['reward'] | null;
  creatureXp?: { level: number; leveledUp: boolean; xp: number };
}

export interface Reward {
  xp: number;
  gold: number;
  level: number;
  leveledUp: boolean;
  goldCapped: number;
}

export interface VisitResult {
  items: Record<string, number>;
  reward: Reward;
  nextVisitAt: string;
}

export interface Mission {
  id: string;
  kind: 'catch' | 'catch_element' | 'win' | 'visit' | 'throw';
  target: number;
  element?: Element;
  name: { es: string; en: string };
  progress: number;
  completed: boolean;
  rewarded: boolean;
}

export interface Wallet {
  gold: number;
  level: number;
  xp: number;
  items: InventoryItem[];
}

export type BattleAction =
  { kind: 'skill'; skill: string } | { kind: 'item'; item: string } | { kind: 'flee' };

export interface OwnedCreature {
  id: string;
  creatureId: string;
  level: number;
  xp: number;
  /** Current HP, including what it recovered while resting. */
  maxHp: number;
  ivs: Stats;
  stats: Stats;
  hp: number;
  acquiredVia: 'capture' | 'starter' | 'trade';
  acquiredAt: string;
  /** Set when the creature is an NFT: being minted, or held by a NEAR account. */
  onchain?: {
    status: 'minting' | 'minted';
    account: string | null;
    edition?: number | null;
    supply?: number | null;
  } | null;
}

export interface CaptureResult {
  result: 'caught' | 'escaped' | 'fled';
  chance: number;
  attempts: number;
  itemsLeft: number;
  reward: { xp: number; gold: number; level: number; leveledUp: boolean; goldCapped: number };
  creature: OwnedCreature | null;
  /** A NEAR tip on its way for walking to this creature, or null. */
  tip?: { id: string; amountNear: string; status: string } | null;
  /** Why this catch paid no tip (null when it did, or for a miss). */
  noTip?: string | null;
}

/** A creature for sale in the game's market (prices in yoctoNEAR). */
export interface MarketListing {
  tokenId: string;
  seller: string;
  priceYocto: string;
  species: string;
  level: number;
  grade: string;
  edition: number | null;
  supply: number | null;
  cardUrl: string;
}

export interface Market {
  contractId: string;
  network: string;
  treasury: string;
  marketFeeBps: number;
  royaltyBps: number;
  listings: MarketListing[];
}

export interface TipRules {
  amountNear: string;
  maxPerDay: number;
  minIntervalMin: number;
  minDistanceM: number;
}

export interface MyTips {
  enabled: boolean;
  network: string;
  rules: TipRules;
  today: number;
  nextTipAt: string | null;
  tips: {
    id: string;
    amountNear: string;
    status: string;
    txHash: string | null;
    createdAt: string;
  }[];
}

export interface DexEntry {
  creatureId: string;
  seenAt: string;
  caughtAt: string | null;
  caughtCount: number;
}

export interface DexElement {
  id: Element;
  name: { es: string; en: string };
  color: string;
  strongAgainst: Element[];
  weakAgainst: Element[];
}

export interface DexCreature {
  id: string;
  dex: number;
  name: string;
  element: Element;
  rarity: Rarity;
  stage: number;
  stats: Stats;
  skills: string[];
  passive: Passive;
  wild: boolean;
  starter: boolean;
  evolution: Evolution | null;
  lore: { es: string; en: string };
  /** Painted portrait (WebP, 384 px wide) served by the web app itself, under /creatures/. */
  art: string;
  /** Same picture, 128 px wide, for lists and map markers. */
  thumb: string;
}

export interface Dex {
  version: number;
  elements: DexElement[];
  skills: Skill[];
  creatures: DexCreature[];
  items: ItemDef[];
  recipes: RecipeDef[];
}

export type PoiReportReason = 'unsafe' | 'private' | 'inaccessible' | 'other';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | 'network',
    message: string,
  ) {
    super(message);
  }
}

/** A NEAR account linked to the player (testnet until the Phase 6 gates). */
export interface NearLink {
  accountId: string;
  network: string;
  linkedAt: string;
}

/** What the wallet must sign (NEP-413). The nonce is base64. */
export interface NearChallenge {
  message: string;
  recipient: string;
  nonce: string;
  network: 'testnet' | 'mainnet';
  expiresAt: string;
}

export interface Friend {
  id: string;
  name: string;
  level: number;
  caught?: number;
}

export interface Friends {
  /** This player's code to share in person. */
  code: string;
  friends: Friend[];
  incoming: Friend[];
  outgoing: Friend[];
}

export interface FriendCreature {
  id: string;
  creatureId: string;
  level: number;
  grade: string;
}

export interface Trade {
  id: string;
  status: 'pending' | 'done' | 'declined' | 'cancelled' | 'expired';
  /** True when this player proposed it. */
  mine: boolean;
  expiresAt: string;
  friendId: string;
  friendName: string;
  giveCreatureId: string;
  giveLevel: number;
  wantCreatureId: string;
  wantLevel: number;
}

export interface DuelFight {
  /** `player` is the challenger, `foe` the friend who answered. */
  winner: 'player' | 'foe' | null;
  turns: { turn: number; events: BattleEvent[] }[];
  hp: { player: number; foe: number };
  /** Full HP of each side (fights stored before it was added lack it). */
  max?: { player: number; foe: number };
}

export interface Duel {
  id: string;
  status: 'pending' | 'done' | 'declined' | 'cancelled' | 'expired';
  /** True when this player made the challenge. */
  mine: boolean;
  expiresAt: string;
  finishedAt: string | null;
  friendId: string;
  friendName: string;
  winner: 'me' | 'friend' | null;
  fromCreatureId: string;
  fromLevel: number;
  toCreatureId: string | null;
  toLevel: number | null;
  fight: DuelFight | null;
}

export interface AvatarState {
  avatar: AvatarLook;
  /** Cosmetics bought (free ones are not listed: everyone has them). */
  owned: string[];
  gold: number;
}

export interface HubMe {
  name: string;
  ageGroup: 'adult' | 'minor';
  companion: string | null;
  companionId: string | null;
  chatMutedUntil: string | null;
  progress: ProgressBreakdown;
}

/** One bout in the gym or the arena, as the history lists it. */
export interface HubBout {
  id: string;
  kind?: 'training' | 'arena_ranked' | 'arena_practice';
  at: string;
  won: boolean | null;
  tier?: number | null;
  creatureId: string;
  level: number;
  opponentCreatureId: string;
  opponentLevel: number;
  opponentName: string | null;
  ratingBefore?: number | null;
  ratingAfter?: number | null;
  hubXp?: number;
  creatureXp?: number;
  /** True when someone challenged this player's defender. */
  defended: boolean;
  fight?: DuelFight;
}

export interface HubReward {
  id: string;
  hubXp: number;
  /** Town XP past today's cap (not paid). */
  xpCapped: number;
  level: number | null;
  leveledUp: boolean;
  won: boolean | null;
  fight: DuelFight;
}

export interface TrainingInfo {
  tiers: number[];
  left: number;
  perDay: number;
  hubXpToday: number;
  hubXpPerDay: number;
  history: HubBout[];
}

export interface TrainingResult extends HubReward {
  coach: { creatureId: string; level: number };
  creature: { level: number; leveledUp: boolean; xp: number };
  left: number;
}

export interface ArenaInfo {
  rating: number;
  wins: number;
  losses: number;
  defenderId: string | null;
  rankedLeft: number;
  rankedPerDay: number;
  hubXpToday: number;
  hubXpPerDay: number;
  history: HubBout[];
  defended: HubBout[];
  leaderboard: { me: boolean; name: string; rating: number; wins: number; losses: number }[];
  season?: string;
  myRank?: number | null;
}

export interface HubQuest {
  id: string;
  kind: string;
  target: number;
  gold: number;
  xp: number;
  progress: number;
  completed: boolean;
  claimed: boolean;
}

export interface Achievement {
  id: string;
  goal: number;
  value: number | null;
  done: boolean;
}

export interface TournamentInfo {
  current: {
    id: string;
    startsAt: string;
    entrants: number;
    min: number;
    max: number;
    myCreature: string | null;
  };
  last: {
    id: string;
    finishedAt: string;
    champion: string | null;
    rounds: { a: string | null; b: string | null; winner: string | null; turns: number }[][];
    myPlace: number | null;
    myPrize: number;
    entered: boolean;
  } | null;
  prizes: number[];
}

export interface SeasonsInfo {
  current: string;
  past: { season: string; rating: number; wins: number; losses: number; rank: number }[];
}

export interface ArenaResult extends HubReward {
  mode: 'ranked' | 'practice';
  opponent: { name: string | null; creatureId: string; level: number };
  ratingBefore: number | null;
  ratingAfter: number | null;
  rankedLeft: number;
}

export interface HubListing {
  id: string;
  itemId: string;
  qty: number;
  /** For the whole lot. */
  price: number;
  expiresAt: string;
  seller?: string;
  fee?: number;
  status?: 'open' | 'sold' | 'cancelled' | 'expired';
  closedAt?: string | null;
}

export interface MarketInfo {
  listings: HubListing[];
  mine: HubListing[];
  items: InventoryItem[];
  gold: number;
  fee: number;
  maxListings: number;
  hours: number;
}

export interface FurnitureInfo {
  catalog: { id: string; price: number }[];
  owned: Record<string, number>;
  gold: number;
}

export type HousePrivacy = 'private' | 'friends' | 'public';
export interface HousePiece {
  f: string;
  x: number;
  y: number;
  flip: boolean;
}
export interface HouseView {
  owner: string;
  name: string;
  mine: boolean;
  privacy?: HousePrivacy;
  layout: HousePiece[];
}
export interface HousesInfo {
  mine: { privacy: HousePrivacy; pieces: number };
  friends: { id: string; name: string }[];
  open: { id: string; name: string; pieces: number }[];
}

export interface GameEvent {
  id: string;
  title: string;
  creatureId: string;
  level: number;
  startsAt: string;
  endsAt: string;
  placeName: string;
  lat: number;
  lng: number;
  distanceM: number;
}

export function createApi(baseUrl: string) {
  async function call<T>(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders: Record<string, string> = {},
  ): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${baseUrl}${path}`, {
        method,
        credentials: 'include',
        headers: {
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          ...extraHeaders,
        },
        body: body === undefined ? null : JSON.stringify(body),
      });
    } catch {
      throw new ApiError(0, 'network', 'Network error');
    }
    if (res.status === 204) return undefined as T;
    const data: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const p = (data ?? {}) as { code?: ErrorCode; title?: string };
      throw new ApiError(res.status, p.code ?? 'internal_error', p.title ?? res.statusText);
    }
    return data as T;
  }

  return {
    /** The API's base URL (the town connects to it over a WebSocket). */
    baseUrl,
    me: () => call<Profile>('GET', '/v1/me'),
    createGuest: (birthYear: number, birthMonth: number) =>
      call<Profile>('POST', '/v1/auth/guest', { birthYear, birthMonth }),
    requestLink: (email: string) => call<{ sent: true }>('POST', '/v1/auth/magic-link', { email }),
    verify: (token: string) => call<Profile>('POST', '/v1/auth/verify', { token }),
    logout: () => call<void>('POST', '/v1/auth/logout'),
    rename: (displayName: string) => call<Profile>('PATCH', '/v1/me', { displayName }),
    exportData: () => call<unknown>('GET', '/v1/me/data-export'),
    deleteAccount: () => call<void>('DELETE', '/v1/me', { confirm: 'DELETE' }),
    nearby: (fix: LocationFix) =>
      call<Nearby>('POST', '/v1/world/nearby', {
        lat: fix.lat,
        lng: fix.lng,
        accuracy: fix.accuracy,
        speed: fix.speed,
        timestamp: Math.round(fix.timestamp),
        ...(fix.mock !== undefined ? { mock: fix.mock } : {}),
      }),
    dex: () => call<Dex>('GET', '/v1/dex'),
    reportPoi: (id: string, reason: PoiReportReason) =>
      call<{ received: true }>('POST', `/v1/pois/${encodeURIComponent(id)}/report`, { reason }),
    encounter: (spawnId: string) =>
      call<Encounter>('POST', `/v1/spawns/${encodeURIComponent(spawnId)}/encounter`),
    /** `key` must stay the same when retrying the same throw, so it is never counted twice. */
    capture: (encounterId: string, item: string, skill: number, key: string) =>
      call<CaptureResult>(
        'POST',
        `/v1/encounters/${encodeURIComponent(encounterId)}/capture`,
        { item, skill },
        { 'idempotency-key': key },
      ),
    inventory: () => call<{ items: InventoryItem[] }>('GET', '/v1/me/inventory'),
    myCreatures: () => call<{ creatures: OwnedCreature[] }>('GET', '/v1/me/creatures'),
    myDex: () => call<{ entries: DexEntry[] }>('GET', '/v1/me/dex'),
    pickStarter: (creatureId: string) =>
      call<OwnedCreature>('POST', '/v1/me/starter', { creatureId }),
    startBattle: (encounterId: string, creature: string) =>
      call<BattleView>('POST', `/v1/encounters/${encodeURIComponent(encounterId)}/battle`, {
        creature,
      }),
    /** `key` must stay the same when retrying the same turn. */
    battleTurn: (battleId: string, action: BattleAction, key: string) =>
      call<BattleView>(
        'POST',
        `/v1/battles/${encodeURIComponent(battleId)}/turn`,
        { action },
        { 'idempotency-key': key },
      ),
    visitPoi: (poiId: string) =>
      call<VisitResult>('POST', `/v1/pois/${encodeURIComponent(poiId)}/visit`),
    missions: () => call<{ day: string; missions: Mission[] }>('GET', '/v1/me/missions'),
    claimMission: (id: string) =>
      call<{ reward: Reward; missions: Mission[] }>(
        'POST',
        `/v1/me/missions/${encodeURIComponent(id)}/claim`,
      ),
    shop: () =>
      call<{ items: { id: string; price: number; kind: string }[]; maxPerPurchase: number }>(
        'GET',
        '/v1/shop',
      ),
    buy: (item: string, qty: number, key: string) =>
      call<Wallet>('POST', '/v1/shop/buy', { item, qty }, { 'idempotency-key': key }),
    craft: (recipe: string, key: string) =>
      call<Wallet>('POST', '/v1/craft', { recipe }, { 'idempotency-key': key }),
    evolve: (creatureId: string) =>
      call<{ from: string; creature: OwnedCreature; gold: number }>(
        'POST',
        `/v1/me/creatures/${encodeURIComponent(creatureId)}/evolve`,
      ),
    nearStatus: () => call<{ network: string; wallet: NearLink | null }>('GET', '/v1/me/wallet'),
    nearChallenge: () => call<NearChallenge>('POST', '/v1/me/wallet/challenge'),
    nearLink: (body: { accountId: string; publicKey: string; signature: string; nonce: string }) =>
      call<{ wallet: NearLink }>('POST', '/v1/me/wallet/link', body),
    nearUnlink: () => call<void>('DELETE', '/v1/me/wallet'),
    /** The card image a minted creature NFT shows in wallets. */
    market: () => call<Market>('GET', '/v1/market'),
    attestStatus: () =>
      call<{
        enabled: boolean;
        verified: boolean;
        until: string | null;
        lastReason: string | null;
      }>('GET', '/v1/me/attest'),
    attestNonce: () =>
      call<{ nonce: string; cloudProjectNumber: string; packageName: string }>(
        'POST',
        '/v1/me/attest/nonce',
      ),
    attest: (nonce: string, token: string) =>
      call<{ verified: true; until: string }>('POST', '/v1/me/attest', { nonce, token }),
    tips: () => call<MyTips>('GET', '/v1/me/tips'),
    friends: () => call<Friends>('GET', '/v1/friends'),
    addFriend: (code: string) =>
      call<{ status: 'friends' | 'requested' }>('POST', '/v1/friends', { code }),
    acceptFriend: (id: string) =>
      call<{ status: 'friends' }>('POST', `/v1/friends/${encodeURIComponent(id)}/accept`),
    removeFriend: (id: string) => call<void>('DELETE', `/v1/friends/${encodeURIComponent(id)}`),
    friendCreatures: (id: string) =>
      call<{ creatures: FriendCreature[] }>(
        'GET',
        `/v1/friends/${encodeURIComponent(id)}/creatures`,
      ),
    trades: () => call<{ trades: Trade[] }>('GET', '/v1/trades'),
    proposeTrade: (to: string, give: string, want: string) =>
      call<{ id: string; status: 'pending'; expiresAt: string }>('POST', '/v1/trades', {
        to,
        give,
        want,
      }),
    acceptTrade: (id: string) =>
      call<{ status: 'done' }>('POST', `/v1/trades/${encodeURIComponent(id)}/accept`),
    declineTrade: (id: string) =>
      call<{ status: 'closed' }>('POST', `/v1/trades/${encodeURIComponent(id)}/decline`),
    avatar: () => call<AvatarState>('GET', '/v1/me/avatar'),
    saveAvatar: (avatar: AvatarLook) => call<AvatarState>('PUT', '/v1/me/avatar', { avatar }),
    /** `key` must stay the same when retrying the same purchase. */
    buyCosmetic: (item: string, key: string) =>
      call<AvatarState>('POST', '/v1/me/cosmetics/buy', { item }, { 'idempotency-key': key }),
    hubMe: () => call<HubMe>('GET', '/v1/hub/me'),
    hubCompanion: (creature: string | null) =>
      call<{ companionId: string | null }>('PUT', '/v1/hub/companion', { creature }),
    hubReport: (message: number, reason: string) =>
      call<{ received: true }>('POST', '/v1/hub/reports', { message, reason }),
    hubBlock: (id: string) =>
      call<{ blocked: true }>('POST', `/v1/hub/blocks/${encodeURIComponent(id)}`),
    hubUnblock: (id: string) => call<void>('DELETE', `/v1/hub/blocks/${encodeURIComponent(id)}`),
    hubTraining: () => call<TrainingInfo>('GET', '/v1/hub/training'),
    hubTrain: (creature: string, tier: number) =>
      call<TrainingResult>('POST', '/v1/hub/training', { creature, tier }),
    hubArena: () => call<ArenaInfo>('GET', '/v1/hub/arena'),
    hubMatch: (creature: string, mode: 'ranked' | 'practice') =>
      call<ArenaResult>('POST', '/v1/hub/arena/match', { creature, mode }),
    hubDefender: (creature: string | null) =>
      call<{ defenderId: string | null }>('PUT', '/v1/hub/arena/defender', { creature }),
    hubMarket: () => call<MarketInfo>('GET', '/v1/hub/market'),
    hubList: (item: string, qty: number, price: number) =>
      call<{ id: string; fee: number; items: InventoryItem[] }>('POST', '/v1/hub/market/listings', {
        item,
        qty,
        price,
      }),
    /** `key` must stay the same when retrying the same purchase. */
    hubBuyListing: (id: string, key: string) =>
      call<{ gold: number; items: InventoryItem[] }>(
        'POST',
        `/v1/hub/market/listings/${encodeURIComponent(id)}/buy`,
        undefined,
        { 'idempotency-key': key },
      ),
    hubWithdraw: (id: string) =>
      call<{ items: InventoryItem[] }>(
        'DELETE',
        `/v1/hub/market/listings/${encodeURIComponent(id)}`,
      ),
    hubFurniture: () => call<FurnitureInfo>('GET', '/v1/hub/furniture'),
    hubBuyFurniture: (item: string, key: string) =>
      call<{ item: string; owned: number; gold: number }>(
        'POST',
        '/v1/hub/furniture/buy',
        { item },
        { 'idempotency-key': key },
      ),
    hubHouses: () => call<HousesInfo>('GET', '/v1/hub/houses'),
    hubHouse: (owner: string) =>
      call<HouseView>('GET', `/v1/hub/house/${encodeURIComponent(owner)}`),
    hubSaveHouse: (body: { privacy?: HousePrivacy; layout?: HousePiece[] }) =>
      call<{ privacy: HousePrivacy; layout: HousePiece[] }>('PUT', '/v1/hub/house', body),
    hubQuests: () => call<{ day: string; quests: HubQuest[] }>('GET', '/v1/hub/quests'),
    hubClaimQuest: (id: string) =>
      call<{ reward: { xp: number; gold: number }; quests: HubQuest[] }>(
        'POST',
        `/v1/hub/quests/${encodeURIComponent(id)}/claim`,
      ),
    hubAchievements: () => call<{ achievements: Achievement[] }>('GET', '/v1/hub/achievements'),
    hubTournament: () => call<TournamentInfo>('GET', '/v1/hub/tournament'),
    hubJoinTournament: (creature: string) =>
      call<{ joined: true }>('POST', '/v1/hub/tournament/join', { creature }),
    hubLeaveTournament: () => call<void>('DELETE', '/v1/hub/tournament/join'),
    hubSeasons: () => call<SeasonsInfo>('GET', '/v1/hub/seasons'),
    hubBlocks: () => call<{ blocked: { id: string; name: string }[] }>('GET', '/v1/hub/blocks'),
    duels: () => call<{ duels: Duel[] }>('GET', '/v1/duels'),
    challenge: (to: string, creature: string) =>
      call<{ id: string; status: 'pending'; expiresAt: string }>('POST', '/v1/duels', {
        to,
        creature,
      }),
    acceptDuel: (id: string, creature: string) =>
      call<{ id: string; status: 'done'; winner: 'me' | 'friend' | null; fight: DuelFight }>(
        'POST',
        `/v1/duels/${encodeURIComponent(id)}/accept`,
        { creature },
      ),
    declineDuel: (id: string) =>
      call<{ status: 'closed' }>('POST', `/v1/duels/${encodeURIComponent(id)}/decline`),
    events: (lat: number, lng: number) =>
      call<{ events: GameEvent[] }>(
        'GET',
        `/v1/events?lat=${lat.toFixed(4)}&lng=${lng.toFixed(4)}`,
      ),
    nftCardUrl: (id: string) => `${baseUrl}/v1/nft/cards/${encodeURIComponent(id)}.png`,
    /** 404 when creature NFTs are switched off on this server. */
    nftInfo: () => call<{ contractId: string; network: string }>('GET', '/v1/nft'),
    mintCreature: (id: string) =>
      call<{ creature: OwnedCreature | null; txHash: string | null; contractId: string }>(
        'POST',
        `/v1/me/creatures/${encodeURIComponent(id)}/mint`,
      ),
    heal: (creatureId: string, item: string) =>
      call<OwnedCreature>('POST', `/v1/me/creatures/${encodeURIComponent(creatureId)}/heal`, {
        item,
      }),
  };
}

export type Api = ReturnType<typeof createApi>;
