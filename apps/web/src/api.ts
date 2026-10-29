import type {
  AgeBand,
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
  reason: 'speed' | 'teleport_cooldown' | null;
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
}

export interface Nearby {
  cell: string;
  movement: Movement;
  visibleRadiusM: number;
  interactionRadiusM: number;
  attribution: string;
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
  acquiredVia: 'capture' | 'starter';
  acquiredAt: string;
}

export interface CaptureResult {
  result: 'caught' | 'escaped' | 'fled';
  chance: number;
  attempts: number;
  itemsLeft: number;
  reward: { xp: number; gold: number; level: number; leveledUp: boolean; goldCapped: number };
  creature: OwnedCreature | null;
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
  /** 2D portrait (SVG) served by the web app itself, under /creatures/. */
  art: string;
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
    heal: (creatureId: string, item: string) =>
      call<OwnedCreature>('POST', `/v1/me/creatures/${encodeURIComponent(creatureId)}/heal`, {
        item,
      }),
  };
}

export type Api = ReturnType<typeof createApi>;
