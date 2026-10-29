import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createDb } from '../src/db.js';
import { MemoryMailer } from '../src/modules/auth/mailer.js';
import { recordSignals } from '../src/modules/anticheat/risk.js';
import { TEST_DB_URL, cookieHeader, createGuest, injectAs } from './helpers.js';

const ADMIN = 'a'.repeat(40);
const REVIEWER = 'r'.repeat(40);

describe.skipIf(!TEST_DB_URL)('admin API', () => {
  const db = createDb(TEST_DB_URL!);
  let app: Awaited<ReturnType<typeof buildApp>>;
  beforeAll(async () => {
    app = await buildApp({
      config: loadConfig({
        DATABASE_URL: TEST_DB_URL!,
        NODE_ENV: 'test',
        APP_URL: 'http://app.test',
        CORS_ORIGINS: 'http://app.test',
        ADMIN_TOKENS: `ana:admin:${ADMIN},rob:reviewer:${REVIEWER}`,
      }),
      db,
      mailer: new MemoryMailer(),
    });
  });
  afterAll(async () => {
    await app.close();
    await db.end();
  });

  const as = (token: string) => ({ authorization: `Bearer ${token}` });
  const call = (token: string, method: 'GET' | 'POST', url: string, payload?: unknown) =>
    injectAs(app, { method, url, payload: payload as object, headers: as(token) });

  it('refuses player sessions and bad tokens, and never says which', async () => {
    const g = await createGuest(app);
    const cookie = await injectAs(app, {
      method: 'GET',
      url: '/admin/v1/me',
      headers: cookieHeader(g.token),
    });
    expect(cookie.statusCode).toBe(401);
    const wrong = await call('x'.repeat(40), 'GET', '/admin/v1/me');
    expect(wrong.statusCode).toBe(401);
    const ok = await call(REVIEWER, 'GET', '/admin/v1/me');
    expect(ok.json()).toEqual({ name: 'rob', role: 'reviewer' });
  });

  it('rejects malformed ADMIN_TOKENS at startup', () => {
    expect(() => loadConfig({ DATABASE_URL: 'x', ADMIN_TOKENS: 'ana:admin:short' })).toThrow(
      /ADMIN_TOKENS/,
    );
    expect(() => loadConfig({ DATABASE_URL: 'x', ADMIN_TOKENS: `ana:boss:${ADMIN}` })).toThrow(
      /ADMIN_TOKENS/,
    );
  });

  it('lists open cases with their signals, closes them with an audited decision, and only admins suspend', async () => {
    const g = await createGuest(app);
    const userId = g.profile.id as string;
    // enough signals to open a case
    await recordSignals(db, userId, [{ kind: 'teleport', score: 80, detail: {} }]);
    const list = await call(REVIEWER, 'GET', '/admin/v1/review-cases');
    const mine = list.json().cases.find((c: { user_id: string }) => c.user_id === userId);
    expect(mine).toMatchObject({
      status: 'open',
      display_name: g.profile.displayName,
      signals: { teleport: 1 },
    });
    expect(JSON.stringify(mine)).not.toContain('email');

    const denied = await call(REVIEWER, 'POST', `/admin/v1/review-cases/${mine.id}/close`, {
      decision: 'restricted',
      reason: 'Repeated teleports over two days',
    });
    expect(denied.statusCode).toBe(403);

    const closed = await call(ADMIN, 'POST', `/admin/v1/review-cases/${mine.id}/close`, {
      decision: 'restricted',
      reason: 'Repeated teleports over two days',
    });
    expect(closed.statusCode).toBe(200);
    expect(closed.json()).toMatchObject({ status: 'closed', decision: 'restricted' });
    // the player is signed out and cannot use the game
    const me = await injectAs(app, {
      method: 'GET',
      url: '/v1/me',
      headers: cookieHeader(g.token),
    });
    expect(me.statusCode).toBe(401);
    const again = await call(ADMIN, 'POST', `/admin/v1/review-cases/${mine.id}/close`, {
      decision: 'no_action',
      reason: 'duplicate click',
    });
    expect(again.statusCode).toBe(409);

    const audit = (await call(REVIEWER, 'GET', '/admin/v1/audit')).json().entries[0];
    expect(audit).toMatchObject({
      role: 'admin',
      action: 'review_case.close',
      reason: 'Repeated teleports over two days',
    });
    expect(audit.before.status).toBe('open');
    expect(audit.after.status).toBe('closed');

    const restore = await call(ADMIN, 'POST', `/admin/v1/accounts/${userId}/restore`, {
      reason: 'Appeal accepted',
    });
    expect(restore.json()).toEqual({ id: userId, status: 'active' });
    const { rows } = await db.query(
      `SELECT count(*)::int AS n FROM admin_audit_log WHERE action = 'account.restore' AND after->>'id' = $1`,
      [userId],
    );
    expect(rows[0].n).toBe(1);
  });

  it('lists reported places and hides or restores them with a reason', async () => {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO pois (kind, name, geom, h3_r9, source, biome, report_count)
       VALUES ('fountain', 'Fuente reportada', ST_SetSRID(ST_MakePoint(-3.1, 40.1), 4326)::geography,
               h3_lat_lng_to_cell(ST_SetSRID(ST_MakePoint(-3.1, 40.1), 4326), 9), 'seed', 'urban', 1)
       RETURNING id`,
    );
    const poi = rows[0]!.id;
    const g = await createGuest(app);
    await db.query(`INSERT INTO poi_reports (user_id, poi_id, reason) VALUES ($1, $2, 'unsafe')`, [
      g.profile.id,
      poi,
    ]);
    const list = (await call(REVIEWER, 'GET', '/admin/v1/pois/reported')).json();
    expect(list.pois.find((p: { id: string }) => p.id === poi)).toMatchObject({
      hidden: false,
      reasons: { unsafe: 1 },
    });

    const hide = await call(REVIEWER, 'POST', `/admin/v1/pois/${poi}`, {
      hidden: true,
      reason: 'Private courtyard',
    });
    expect(hide.json()).toMatchObject({ hidden: true });
    const back = await call(REVIEWER, 'POST', `/admin/v1/pois/${poi}`, {
      hidden: false,
      reason: 'Checked on site, it is public',
    });
    expect(back.json()).toMatchObject({ hidden: false, report_count: 0 });
    const reports = await db.query(`SELECT count(*)::int AS n FROM poi_reports WHERE poi_id = $1`, [
      poi,
    ]);
    expect(reports.rows[0].n).toBe(0);
    const short = await call(REVIEWER, 'POST', `/admin/v1/pois/${poi}`, {
      hidden: true,
      reason: 'no',
    });
    expect(short.statusCode).toBe(400);
  });

  it('is absent when no admin tokens are configured', async () => {
    const bare = await buildApp({
      config: loadConfig({
        DATABASE_URL: TEST_DB_URL!,
        NODE_ENV: 'test',
        APP_URL: 'http://app.test',
        CORS_ORIGINS: 'http://app.test',
      }),
      db,
      mailer: new MemoryMailer(),
    });
    try {
      const res = await injectAs(bare, {
        method: 'GET',
        url: '/admin/v1/me',
        headers: as(randomBytes(20).toString('hex')),
      });
      expect(res.statusCode).toBe(404);
    } finally {
      await bare.close();
    }
  });
});
