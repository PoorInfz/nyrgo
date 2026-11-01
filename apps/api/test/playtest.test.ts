import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FEEDBACK_PER_DAY } from '../src/modules/feedback/routes.js';
import {
  TEST_DB_URL,
  cookieHeader,
  createGuest,
  injectAs,
  makeTestApp,
  type TestApp,
} from './helpers.js';

const ADMIN = 'p'.repeat(40);
const REVIEWER = 'q'.repeat(40);

describe.skipIf(!TEST_DB_URL)('playtest: activity, comments and metrics', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await makeTestApp({ env: { ADMIN_TOKENS: `ana:admin:${ADMIN},rob:reviewer:${REVIEWER}` } });
  });
  afterAll(() => t.close());

  const admin = (token: string, method: 'GET' | 'POST', url: string, payload?: object) =>
    injectAs(t.app, {
      method,
      url,
      headers: { authorization: `Bearer ${token}` },
      ...(payload ? { payload } : {}),
    });

  it('counts a signed-in player as active today, once', async () => {
    const g = await createGuest(t.app, 1990);
    const id = g.profile.id as string;
    for (let i = 0; i < 3; i++) {
      await injectAs(t.app, { method: 'GET', url: '/v1/me', headers: cookieHeader(g.token) });
    }
    const { rows } = await t.db.query<{ day: string }>(
      `SELECT to_char(day, 'YYYY-MM-DD') AS day FROM player_days WHERE user_id = $1`,
      [id],
    );
    expect(rows).toEqual([{ day: new Date().toISOString().slice(0, 10) }]);
  });

  it('takes comments from the game, with a daily limit, and lets the team close them', async () => {
    const g = await createGuest(t.app, 1990);
    const send = (payload: object) =>
      injectAs(t.app, {
        method: 'POST',
        url: '/v1/feedback',
        headers: { ...cookieHeader(g.token), 'user-agent': 'TestPhone/1.0' },
        payload,
      });
    const words = `The vault mini-game is fun ${randomUUID().slice(0, 6)}`;
    const ok = await send({
      category: 'fun',
      body: words,
      screen: 'encounter',
      build: '0.44.0',
      lang: 'es',
    });
    expect(ok.statusCode).toBe(201);
    expect((await send({ category: 'bug', body: 'x' })).statusCode).toBe(400);
    expect((await send({ category: 'nope', body: 'something' })).statusCode).toBe(400);
    // nobody signed in: no comment
    const anon = await injectAs(t.app, {
      method: 'POST',
      url: '/v1/feedback',
      payload: { category: 'idea', body: 'hello there' },
    });
    expect(anon.statusCode).toBe(401);

    const list = (await admin(REVIEWER, 'GET', '/admin/v1/feedback')).json();
    const mine = list.feedback.find((f: { body: string }) => f.body === words);
    expect(mine).toMatchObject({
      category: 'fun',
      screen: 'encounter',
      build: '0.44.0',
      agent: 'TestPhone/1.0',
      status: 'open',
      daysPlayed: 1,
    });
    const closed = await admin(REVIEWER, 'POST', `/admin/v1/feedback/${mine.id}/close`, {
      note: 'thanks',
    });
    expect(closed.json()).toEqual({ closed: true });
    expect(
      (await admin(REVIEWER, 'POST', `/admin/v1/feedback/${mine.id}/close`, {})).statusCode,
    ).toBe(404);
    const done = (await admin(ADMIN, 'GET', '/admin/v1/feedback?status=done')).json();
    expect(done.feedback.find((f: { id: number }) => f.id === mine.id)).toMatchObject({
      status: 'done',
      note: 'thanks',
    });

    // the daily limit
    await t.db.query(
      `INSERT INTO feedback (user_id, category, body)
       SELECT $1, 'idea', 'more ideas' FROM generate_series(1, $2)`,
      [g.profile.id, FEEDBACK_PER_DAY],
    );
    expect((await send({ category: 'idea', body: 'one more' })).json().code).toBe('rate_limited');
  });

  it('reports actives, retention, the first-steps funnel and the mini-game', async () => {
    // a player who joined 8 days ago and came back the next day and a week later
    const g = await createGuest(t.app, 1990);
    const id = g.profile.id as string;
    await t.db.query(`UPDATE users SET created_at = now() - interval '8 days' WHERE id = $1`, [id]);
    await t.db.query(
      `INSERT INTO player_days (user_id, day) SELECT $1, (now() AT TIME ZONE 'UTC')::date - k
         FROM unnest(ARRAY[8, 7, 1]) k ON CONFLICT DO NOTHING`,
      [id],
    );
    const r = await admin(REVIEWER, 'GET', '/admin/v1/metrics?days=14');
    expect(r.statusCode).toBe(200);
    const m = r.json();
    expect(m.days).toBe(14);
    expect(m.daily).toHaveLength(14);
    expect(m.daily.at(-1).day).toBe(new Date().toISOString().slice(0, 10));
    expect(m.totals.players).toBeGreaterThan(0);
    expect(m.totals.today).toBeGreaterThan(0);
    const cohort = m.cohorts.find(
      (c: { day: string }) =>
        c.day === new Date(Date.now() - 8 * 86_400_000).toISOString().slice(0, 10),
    );
    expect(cohort.size).toBeGreaterThanOrEqual(1);
    expect(cohort.d1).toBeGreaterThan(0);
    expect(cohort.d7).toBeGreaterThan(0);
    expect(m.funnel.joined).toBeGreaterThanOrEqual(m.funnel.returned);
    expect(m.funnel.week).toBeGreaterThanOrEqual(1);
    expect(m.throws).toHaveProperty('byRarity');
    expect(m.feedback).toHaveProperty('open');
    // players cannot see it
    const g2 = await createGuest(t.app, 1990);
    const no = await injectAs(t.app, {
      method: 'GET',
      url: '/admin/v1/metrics',
      headers: cookieHeader(g2.token),
    });
    expect(no.statusCode).toBe(401);
  });
});
