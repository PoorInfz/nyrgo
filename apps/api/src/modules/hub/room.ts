import {
  DEFAULT_CONFIG,
  HUB_MAPS,
  TILE,
  canStand,
  walk,
  type AvatarLook,
  type HubMap,
} from '@nyrgo/shared';

/**
 * A district of the town, live: who is here, where they stand, and what they say. It holds only
 * presence (nothing here is a reward or a possession, so a restart loses nothing that matters).
 *
 * The server is the authority on positions: a move is accepted only if it is walkable and no
 * faster than walking allows; otherwise the player is put back where the server last saw them.
 * Each tick, every player is sent only the players within view (interest management).
 */

export const EMOTES = ['wave', 'heart', 'laugh', 'cheer', 'question', 'sad'] as const;
export type Emote = (typeof EMOTES)[number];
export type AgeGroup = 'adult' | 'minor';

export interface Socket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export interface Member {
  userId: string;
  name: string;
  level: number;
  look: AvatarLook;
  /** Species of the creature that follows them, or null. */
  companion: string | null;
  ageGroup: AgeGroup;
  /** Players this one has blocked, and players who blocked them: they never hear each other. */
  muted: Set<string>;
  socket: Socket;
  x: number;
  y: number;
  facing: 'l' | 'r';
  moving: boolean;
  lastMoveAt: number;
  chatAt: number[];
  lastChat: { text: string; at: number } | null;
  /** Players whose name, look and companion this client has already been sent. */
  known: Set<string>;
}

export type Outgoing =
  | {
      t: 'welcome';
      you: string;
      room: string;
      x: number;
      y: number;
      ageGroup: AgeGroup;
    }
  /**
   * Players in view: `[id, x, y, facing, moving]`, plus `profiles` for those this client has not
   * seen yet (so looks are not resent ten times a second).
   */
  | { t: 'state'; players: [string, number, number, 'l' | 'r', 0 | 1][]; profiles?: Profile[] }
  | { t: 'pos'; x: number; y: number }
  | { t: 'emote'; id: string; e: Emote }
  | { t: 'chat'; id: string; mid: string; name: string; text: string; at: number }
  | { t: 'error'; code: string };

export interface Profile {
  id: string;
  name: string;
  level: number;
  look: AvatarLook;
  companion: string | null;
}

const cfg = () => DEFAULT_CONFIG.hub;

export class Room {
  readonly map: HubMap;
  readonly members = new Map<string, Member>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private now: () => number;

  constructor(
    readonly id: string,
    opts: { now?: () => number; autoTick?: boolean } = {},
  ) {
    this.map = HUB_MAPS[id]!;
    this.now = opts.now ?? Date.now;
    if (opts.autoTick !== false) {
      this.timer = setInterval(() => this.tick(), Math.round(1000 / cfg().tickHz));
      this.timer.unref?.();
    }
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private send(m: Member, msg: Outgoing) {
    try {
      m.socket.send(JSON.stringify(msg));
    } catch {
      // a closing socket: the close handler removes the member
    }
  }

  /**
   * Adds a player at the entrance (or at `at`, when they come through a door); an older
   * connection of the same player in this room is closed.
   */
  join(
    member: Omit<
      Member,
      'x' | 'y' | 'facing' | 'moving' | 'lastMoveAt' | 'chatAt' | 'lastChat' | 'known'
    >,
    at?: { x: number; y: number },
  ) {
    const old = this.members.get(member.userId);
    if (old && old.socket !== member.socket) old.socket.close(4000, 'replaced');
    const m: Member = {
      ...member,
      x: at ? at.x : this.map.spawn.x + Math.round((Math.random() - 0.5) * 60),
      y: at ? at.y : this.map.spawn.y,
      facing: 'r',
      moving: false,
      lastMoveAt: this.now(),
      chatAt: [],
      lastChat: null,
      known: new Set(),
    };
    if (!canStand(this.map, m.x, m.y)) {
      m.x = this.map.spawn.x;
      m.y = this.map.spawn.y;
    }
    // others get this player's profile afresh: the look or companion may have changed
    for (const o of this.members.values()) o.known.delete(m.userId);
    this.members.set(m.userId, m);
    this.send(m, {
      t: 'welcome',
      you: m.userId,
      room: this.id,
      x: m.x,
      y: m.y,
      ageGroup: m.ageGroup,
    });
    this.tick();
    return m;
  }

  leave(userId: string, socket?: Socket) {
    const m = this.members.get(userId);
    if (!m || (socket && m.socket !== socket)) return;
    this.members.delete(userId);
  }

  /** A move request from the client: walkable and at walking speed, or snapped back. */
  move(userId: string, x: number, y: number, facing: 'l' | 'r', moving: boolean) {
    const m = this.members.get(userId);
    if (!m) return;
    const now = this.now();
    const dt = Math.min(2, Math.max(0, (now - m.lastMoveAt) / 1000));
    const allowed = cfg().maxSpeedTiles * TILE * dt + TILE * 0.75;
    const dist = Math.hypot(x - m.x, y - m.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || dist > allowed) {
      this.send(m, { t: 'pos', x: m.x, y: m.y });
      return;
    }
    const to = walk(this.map, { x: m.x, y: m.y }, { x: Math.round(x), y: Math.round(y) });
    if (to.x !== Math.round(x) || to.y !== Math.round(y))
      this.send(m, { t: 'pos', x: to.x, y: to.y });
    m.x = to.x;
    m.y = to.y;
    m.facing = facing;
    m.moving = moving;
    m.lastMoveAt = now;
  }

  private canHear(a: Member, b: Member) {
    return !a.muted.has(b.userId) && !b.muted.has(a.userId);
  }

  private near(a: Member, b: Member) {
    const r = cfg().viewRadius * TILE;
    return Math.abs(a.x - b.x) <= r * 1.4 && Math.abs(a.y - b.y) <= r;
  }

  emote(userId: string, e: string) {
    const m = this.members.get(userId);
    if (!m || !(EMOTES as readonly string[]).includes(e)) return;
    for (const o of this.members.values()) {
      if (this.near(m, o) && this.canHear(m, o))
        this.send(o, { t: 'emote', id: m.userId, e: e as Emote });
    }
  }

  /**
   * Whether this player may speak now: not over the per-minute limit and not repeating the
   * same message within half a minute. Records the attempt when allowed.
   */
  allowChat(userId: string, text: string): 'ok' | 'rate_limited' | 'repeat' {
    const m = this.members.get(userId);
    if (!m) return 'rate_limited';
    const now = this.now();
    m.chatAt = m.chatAt.filter((t) => now - t < 60_000);
    if (m.chatAt.length >= cfg().chatPerMinute) return 'rate_limited';
    if (m.lastChat && m.lastChat.text === text && now - m.lastChat.at < 30_000) return 'repeat';
    m.chatAt.push(now);
    m.lastChat = { text, at: now };
    return 'ok';
  }

  /** Delivers a checked message to everyone in the room of the same age group who can hear it. */
  say(userId: string, mid: string, text: string) {
    const m = this.members.get(userId);
    if (!m) return;
    const msg: Outgoing = { t: 'chat', id: m.userId, mid, name: m.name, text, at: this.now() };
    for (const o of this.members.values()) {
      if (o.ageGroup === m.ageGroup && this.canHear(m, o)) this.send(o, msg);
    }
  }

  error(userId: string, code: string) {
    const m = this.members.get(userId);
    if (m) this.send(m, { t: 'error', code });
  }

  /** Keeps a member's block list in step after they block or unblock someone. */
  setMuted(userId: string, other: string, muted: boolean) {
    for (const [a, b] of [
      [userId, other],
      [other, userId],
    ] as const) {
      const m = this.members.get(a);
      if (!m) continue;
      if (muted) m.muted.add(b);
      else m.muted.delete(b);
    }
  }

  /** Sends each player the players around them. */
  tick() {
    const all = [...this.members.values()];
    for (const m of all) {
      const seen = all.filter((o) => o === m || (this.near(m, o) && this.canHear(m, o)));
      const profiles: Profile[] = [];
      for (const o of seen) {
        if (m.known.has(o.userId)) continue;
        m.known.add(o.userId);
        profiles.push({
          id: o.userId,
          name: o.name,
          level: o.level,
          look: o.look,
          companion: o.companion,
        });
      }
      this.send(m, {
        t: 'state',
        players: seen.map((o) => [
          o.userId,
          Math.round(o.x),
          Math.round(o.y),
          o.facing,
          o.moving ? 1 : 0,
        ]),
        ...(profiles.length ? { profiles } : {}),
      });
    }
  }
}
