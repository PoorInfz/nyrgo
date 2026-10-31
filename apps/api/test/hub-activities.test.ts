import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { DEFAULT_CONFIG, normaliseLook, xpForLevel } from '@nyrgo/shared';
import { withTx } from '../src/db.js';
import { grantReward } from '../src/modules/progress/rewards.js';
import { syncContent } from '../src/modules/content/sync.js';
import { Room } from '../src/modules/hub/room.js';
import {
  TEST_DB_URL,
  cookieHeader,
  createGuest,
  daytimeZone,
  injectAs,
  makeTestApp,
  type TestApp,
} from './helpers.js';

const hub = DEFAULT_CONFIG.hub;

describe.skipIf(!TEST_DB_URL)('the gym and the arena', () => {
  let t: TestApp;
  const rooms = new Map(
    ['plaza', 'gym', 'arena'].map((id) => [id, new Room(id, { autoTick: false })] as const),
  );
  beforeAll(async () => {
    t = await makeTestApp({ hubRooms: rooms });
    await syncContent(t.db);
  });
  afterAll(() => t.close());

  async function player(birthYear = 1995, rating = 1000) {
    const g = await createGuest(t.app, birthYear);
    const id = g.profile.id as string;
    // daily limits count per local day: keep the test away from the player's midnight
    await t.db.query(`UPDATE players SET time_zone = $2, arena_rating = $3 WHERE user_id = $1`, [
      id,
      daytimeZone(),
      rating,
    ]);
    const call = (method: 'GET' | 'POST' | 'PUT', url: string, payload?: object) =>
      injectAs(t.app, {
        method,
        url,
        ...(payload ? { payload } : {}),
        headers: cookieHeader(g.token),
      });
    const creature = async (species = 'gwisp', level = 10) => {
      const { rows } = await t.db.query<{ id: string }>(
        `INSERT INTO creature_instances (definition_id, owner_id, level, ivs, hp_current, acquired_via, acquired_ref)
         VALUES ($1, $2, $3, '{"hp":5,"atk":5,"def":5,"spd":5}', 30, 'capture', gen_random_uuid()) RETURNING id`,
        [species, id, level],
      );
      return rows[0]!.id;
    };
    /** Stands the player inside a building (as walking through its door would). */
    const enter = (room: string) => {
      for (const r of rooms.values()) r.leave(id);
      rooms.get(room)!.join({
        userId: id,
        name: 'p',
        level: 1,
        look: normaliseLook(null),
        companion: null,
        ageGroup: birthYear < 2000 ? 'adult' : 'minor',
        muted: new Set(),
        socket: { send: () => undefined, close: () => undefined },
      });
    };
    const xp = async () =>
      (
        await t.db.query<{ main: string; hub: string; xp: string }>(
          `SELECT main_xp AS main, hub_xp AS hub, xp FROM players WHERE user_id = $1`,
          [id],
        )
      ).rows[0]!;
    return { id, call, creature, enter, xp };
  }

  it('trains only inside the gym, pays town XP and creature XP, and stops at the daily limit', async () => {
    const p = await player();
    const c = await p.creature();
    expect((await p.call('POST', '/v1/hub/training', { creature: c, tier: 0 })).json().code).toBe(
      'hub_not_here',
    );
    p.enter('gym');
    const first = await p.call('POST', '/v1/hub/training', { creature: c, tier: 0 });
    expect(first.statusCode).toBe(200);
    const r = first.json();
    expect(r.coach.level).toBe(10 + hub.trainingTiers[0]!);
    expect(r.fight.turns.length).toBeGreaterThan(0);
    expect(r.hubXp).toBe(r.won ? hub.trainingWinXp : hub.trainingLossXp);
    expect(r.left).toBe(hub.trainingsPerDay - 1);
    const ci = await t.db.query<{ xp: string }>(`SELECT xp FROM creature_instances WHERE id = $1`, [
      c,
    ]);
    expect(Number(ci.rows[0]!.xp)).toBeGreaterThan(0);
    // a player with no outdoor XP has nothing for town XP to count against yet: it waits
    const x = await p.xp();
    expect(Number(x.hub)).toBe(r.hubXp);
    expect(Number(x.xp)).toBe(Number(x.main));

    for (let i = 1; i < hub.trainingsPerDay; i++) {
      expect((await p.call('POST', '/v1/hub/training', { creature: c, tier: 4 })).statusCode).toBe(
        200,
      );
    }
    const over = await p.call('POST', '/v1/hub/training', { creature: c, tier: 0 });
    expect(over.json().code).toBe('hub_limit');
    const info = (await p.call('GET', '/v1/hub/training')).json();
    expect(info.left).toBe(0);
    expect(info.history).toHaveLength(hub.trainingsPerDay);
    expect(info.hubXpToday).toBeLessThanOrEqual(hub.xpPerDay);
  });

  it('levels a player up with town XP when outdoor XP allows it', async () => {
    const p = await player();
    const c = await p.creature();
    // just short of level 5 outdoors: any town XP now counts and crosses the line
    await withTx(t.db, (tx) =>
      grantReward(tx, p.id, {
        xp: xpForLevel(5) - 1,
        gold: 0,
        reason: 'test',
        refId: randomUUID(),
      }),
    );
    p.enter('gym');
    const r = (await p.call('POST', '/v1/hub/training', { creature: c, tier: 0 })).json();
    expect(r.hubXp).toBeGreaterThan(0);
    expect(r).toMatchObject({ leveledUp: true, level: 5 });
  });

  it('refuses a creature that is not yours', async () => {
    const a = await player();
    const b = await player();
    const theirs = await b.creature();
    a.enter('gym');
    expect(
      (await a.call('POST', '/v1/hub/training', { creature: theirs, tier: 1 })).json().code,
    ).toBe('not_found');
  });

  it('caps town XP per day across activities', async () => {
    const p = await player();
    const c = await p.creature();
    // pretend most of today's allowance is gone
    await t.db.query(
      `INSERT INTO hub_activities (user_id, kind, creature_def, creature_level, opponent_def, opponent_level, hub_xp, fight)
       VALUES ($1, 'arena_practice', 'gwisp', 1, 'gwisp', 1, $2, '{}')`,
      [p.id, hub.xpPerDay - 2],
    );
    p.enter('gym');
    const r = (await p.call('POST', '/v1/hub/training', { creature: c, tier: 0 })).json();
    expect(r.hubXp).toBe(2);
    expect(r.xpCapped).toBeGreaterThan(0);
  });

  it('matches ranked battles by rating within the age group and moves both ratings', async () => {
    const base = 100_000 + Math.floor(Math.random() * 10_000_000);
    const a = await player(1995, base);
    const b = await player(1995, base + 50);
    const teen = await player(new Date().getFullYear() - 15, base);
    const far = await player(1995, base + 5000);
    const ca = await a.creature('gwisp', 12);
    const cb = await b.creature('gwisp', 12);
    await teen.creature();
    await far.creature();
    expect((await b.call('PUT', '/v1/hub/arena/defender', { creature: cb })).json()).toEqual({
      defenderId: cb,
    });
    expect(
      (await a.call('POST', '/v1/hub/arena/match', { creature: ca, mode: 'ranked' })).json().code,
    ).toBe('hub_not_here');
    a.enter('arena');
    const r = (
      await a.call('POST', '/v1/hub/arena/match', { creature: ca, mode: 'ranked' })
    ).json();
    expect(r.opponent).toMatchObject({ name: expect.any(String), creatureId: 'gwisp', level: 12 });
    expect(r.ratingBefore).toBe(base);
    const rows = await t.db.query<{ user_id: string; arena_rating: number }>(
      `SELECT user_id, arena_rating FROM players WHERE user_id = ANY($1)`,
      [[a.id, b.id]],
    );
    const ra = rows.rows.find((x) => x.user_id === a.id)!.arena_rating;
    const rb = rows.rows.find((x) => x.user_id === b.id)!.arena_rating;
    expect(ra).toBe(r.ratingAfter);
    if (r.won === true) expect([ra > base, rb < base + 50]).toEqual([true, true]);
    if (r.won === false) expect([ra < base, rb > base + 50]).toEqual([true, true]);
    expect(r.hubXp).toBe(r.won ? hub.rankedWinXp : hub.rankedLossXp);
    const act = await t.db.query(`SELECT opponent_user FROM hub_activities WHERE id = $1`, [r.id]);
    expect(act.rows[0].opponent_user).toBe(b.id);

    // the defender sees it; the board lists both
    const info = (await b.call('GET', '/v1/hub/arena')).json();
    expect(info.defended[0]).toMatchObject({ defended: true, opponentCreatureId: 'gwisp' });
    expect(info.myRank).toBeGreaterThanOrEqual(1);
    expect(info.season).toMatch(/^\d{4}-\d{2}$/);
  });

  it('limits ranked battles against one opponent and finds nobody out of range', async () => {
    // far from every other test player (and from earlier runs)
    const base = 100_000 + Math.floor(Math.random() * 10_000_000);
    const a = await player(1995, base);
    const b = await player(1995, base);
    const ca = await a.creature();
    await b.creature();
    a.enter('arena');
    for (let i = 0; i < 3; i++) {
      const r = await a.call('POST', '/v1/hub/arena/match', { creature: ca, mode: 'ranked' });
      expect(r.statusCode).toBe(200);
      // keep both in range of each other whatever happened
      await t.db.query(`UPDATE players SET arena_rating = $2 WHERE user_id = ANY($1)`, [
        [a.id, b.id],
        base,
      ]);
    }
    const fourth = await a.call('POST', '/v1/hub/arena/match', { creature: ca, mode: 'ranked' });
    expect(fourth.json().code).toBe('no_opponent');
    // practice still works: against the host, for nothing
    const pr = (
      await a.call('POST', '/v1/hub/arena/match', { creature: ca, mode: 'practice' })
    ).json();
    expect(pr).toMatchObject({ mode: 'practice', hubXp: 0, ratingAfter: null });
    const info = (await a.call('GET', '/v1/hub/arena')).json();
    expect(info.rankedLeft).toBe(hub.rankedPerDay - 3);
    expect(info.history).toHaveLength(4);
  });
});
