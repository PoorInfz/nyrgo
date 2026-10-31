import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  HUB_QUESTS,
  TOURNAMENT_PRIZES,
  arenaSeason,
  dailyHubQuests,
  normaliseLook,
} from '@nyrgo/shared';
import { syncContent } from '../src/modules/content/sync.js';
import { gameDay } from '../src/modules/economy/missions.js';
import { bumpHubQuest, nextTournamentStart, runTournaments } from '../src/modules/hub/board.js';
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

const ADMIN = 'b'.repeat(40);

describe.skipIf(!TEST_DB_URL)('the notice board, seasons, tournaments and achievements', () => {
  let t: TestApp;
  const arena = new Room('arena', { autoTick: false });
  beforeAll(async () => {
    t = await makeTestApp({
      hubRooms: new Map([
        ['plaza', new Room('plaza', { autoTick: false })],
        ['arena', arena],
      ]),
      env: { ADMIN_TOKENS: `ops:admin:${ADMIN}` },
    });
    await syncContent(t.db);
  });
  afterAll(() => t.close());

  async function player(birthYear = 1995) {
    const g = await createGuest(t.app, birthYear);
    const id = g.profile.id as string;
    await t.db.query(`UPDATE players SET time_zone = $2 WHERE user_id = $1`, [id, daytimeZone()]);
    const call = (method: 'GET' | 'POST' | 'DELETE', url: string, payload?: object) =>
      injectAs(t.app, {
        method,
        url,
        ...(payload ? { payload } : {}),
        headers: cookieHeader(g.token),
      });
    const creature = async (level = 10) =>
      (
        await t.db.query<{ id: string }>(
          `INSERT INTO creature_instances (definition_id, owner_id, level, ivs, hp_current, acquired_via, acquired_ref)
           VALUES ('gwisp', $1, $2, '{"hp":5,"atk":5,"def":5,"spd":5}', 30, 'capture', gen_random_uuid()) RETURNING id`,
          [id, level],
        )
      ).rows[0]!.id;
    const enterArena = () =>
      arena.join({
        userId: id,
        name: 'p',
        level: 1,
        look: normaliseLook(null),
        companion: null,
        ageGroup: birthYear < 2000 ? 'adult' : 'minor',
        muted: new Set(),
        socket: { send: () => undefined, close: () => undefined },
      });
    return { id, call, creature, enterArena };
  }

  it('gives three daily quests that pay once when done', async () => {
    const p = await player();
    const day = await gameDay(t.db, p.id);
    const picked = dailyHubQuests(p.id, day);
    const q = (await p.call('GET', '/v1/hub/quests')).json();
    expect(q.quests.map((x: { id: string }) => x.id)).toEqual(picked.map((x) => x.id));
    const first = picked[0]!;
    expect((await p.call('POST', `/v1/hub/quests/${first.id}/claim`)).json().code).toBe(
      'quest_not_done',
    );
    // something that is not today's quest moves nothing
    const other = HUB_QUESTS.find((h) => !picked.some((x) => x.kind === h.kind))!;
    await bumpHubQuest(t.db, p.id, other.kind, 5);
    await bumpHubQuest(t.db, p.id, first.kind, first.target);
    const claimed = (await p.call('POST', `/v1/hub/quests/${first.id}/claim`)).json();
    expect(claimed.reward).toMatchObject({ xp: first.xp });
    expect(claimed.quests[0]).toMatchObject({ completed: true, claimed: true });
    expect((await p.call('POST', `/v1/hub/quests/${first.id}/claim`)).json().code).toBe(
      'quest_not_done',
    );
    const hub = await t.db.query<{ hub_xp: string }>(
      `SELECT hub_xp FROM players WHERE user_id = $1`,
      [p.id],
    );
    expect(Number(hub.rows[0]!.hub_xp)).toBe(first.xp);
  });

  it('closes a season: the record is kept and the rating carries halfway back', async () => {
    const p = await player();
    await t.db.query(
      `UPDATE players SET arena_season = '2026-09', arena_rating = 1200, arena_wins = 5, arena_losses = 2
        WHERE user_id = $1`,
      [p.id],
    );
    const s = (await p.call('GET', '/v1/hub/seasons')).json();
    expect(s.current).toBe(arenaSeason());
    expect(s.past[0]).toMatchObject({ season: '2026-09', rating: 1200, wins: 5, losses: 2 });
    expect(s.past[0].rank).toBeGreaterThan(0);
    const now = await t.db.query(
      `SELECT arena_rating, arena_wins, arena_season FROM players WHERE user_id = $1`,
      [p.id],
    );
    expect(now.rows[0]).toEqual({ arena_rating: 1100, arena_wins: 0, arena_season: arenaSeason() });
  });

  it('plays the weekly tournament: bracket, places, prizes, and opens the next one', async () => {
    expect(nextTournamentStart(new Date('2026-10-31T17:00:00Z')).toISOString()).toBe(
      '2026-10-31T18:00:00.000Z',
    );
    expect(nextTournamentStart(new Date('2026-10-31T18:00:00Z')).toISOString()).toBe(
      '2026-11-07T18:00:00.000Z',
    );
    const ps = [];
    for (let i = 0; i < 5; i++) ps.push(await player());
    const first = (await ps[0]!.call('GET', '/v1/hub/tournament')).json();
    expect(first.current).toMatchObject({ min: 4, myCreature: null });
    const c0 = await ps[0]!.creature();
    expect(
      (await ps[0]!.call('POST', '/v1/hub/tournament/join', { creature: c0 })).json().code,
    ).toBe('hub_not_here');
    for (const p of ps) {
      p.enterArena();
      const c = await p.creature(8 + ps.indexOf(p));
      expect((await p.call('POST', '/v1/hub/tournament/join', { creature: c })).statusCode).toBe(
        200,
      );
    }
    // a teen signs up for their own age group's tournament
    const teen = await player(new Date().getFullYear() - 15);
    teen.enterArena();
    await teen.call('POST', '/v1/hub/tournament/join', { creature: await teen.creature() });

    await t.db.query(
      `UPDATE hub_tournaments SET starts_at = now() - interval '1 minute' WHERE id = $1`,
      [first.current.id],
    );
    const goldBefore = await t.db.query<{ user_id: string; gold: string }>(
      `SELECT user_id, gold FROM players WHERE user_id = ANY($1)`,
      [ps.map((p) => p.id)],
    );
    const run = await runTournaments(t.db);
    expect(run.played).toContainEqual(
      expect.objectContaining({ id: first.current.id, status: 'done' }),
    );
    const places = await t.db.query<{ user_id: string; place: number | null; prize: number }>(
      `SELECT user_id, place, prize FROM hub_tournament_entries WHERE tournament_id = $1`,
      [first.current.id],
    );
    const placed = places.rows
      .filter((r) => r.place !== null)
      .map((r) => r.place)
      .sort();
    expect(placed.slice(0, 2)).toEqual([1, 2]);
    const champ = places.rows.find((r) => r.place === 1)!;
    expect(champ.prize).toBe(TOURNAMENT_PRIZES[0]);
    const mine = ps.find((p) => p.id === champ.user_id);
    if (mine) {
      const before = Number(goldBefore.rows.find((r) => r.user_id === mine.id)!.gold);
      const after = await t.db.query<{ gold: string }>(
        `SELECT gold FROM players WHERE user_id = $1`,
        [mine.id],
      );
      expect(Number(after.rows[0]!.gold)).toBe(before + TOURNAMENT_PRIZES[0]!);
      const ach = (await mine.call('GET', '/v1/hub/achievements')).json().achievements;
      expect(ach.find((a: { id: string }) => a.id === 'champion').done).toBe(true);
    }
    const view = (await ps[1]!.call('GET', '/v1/hub/tournament')).json();
    expect(view.last.id).toBe(first.current.id);
    expect(view.last.entered).toBe(true);
    expect(view.last.rounds.length).toBeGreaterThanOrEqual(3);
    expect(view.current.id).not.toBe(first.current.id);
    // the teen's tournament is another one, untouched
    const tv = (await teen.call('GET', '/v1/hub/tournament')).json();
    expect(tv.current.id).not.toBe(first.current.id);
    expect(tv.current.myCreature).not.toBeNull();
  });

  it('shows the town to admins', async () => {
    const r = await injectAs(t.app, {
      method: 'GET',
      url: '/admin/v1/hub/stats',
      headers: { authorization: `Bearer ${ADMIN}` },
    });
    expect(r.statusCode).toBe(200);
    expect(r.json().live).toMatchObject({ online: expect.any(Number) });
    expect(r.json()).toHaveProperty('openReports');
  });
});
