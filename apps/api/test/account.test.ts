import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  TEST_DB_URL,
  injectAs,
  cookieHeader,
  createGuest,
  makeTestApp,
  randomEmail,
  sessionCookie,
  tokenFromLink,
  type TestApp,
} from './helpers.js';

describe.skipIf(!TEST_DB_URL)('profile and GDPR rights', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await makeTestApp();
  });
  afterAll(() => t.close());

  const patchName = (token: string, displayName: string) =>
    injectAs(t.app, {
      method: 'PATCH',
      url: '/v1/me',
      payload: { displayName },
      headers: cookieHeader(token),
    });

  const del = (token: string, confirm = 'DELETE') =>
    injectAs(t.app, {
      method: 'DELETE',
      url: '/v1/me',
      payload: { confirm },
      headers: cookieHeader(token),
    });

  async function registered() {
    const guest = await createGuest(t.app);
    await injectAs(t.app, {
      method: 'POST',
      url: '/v1/auth/magic-link',
      payload: { email: randomEmail() },
      headers: cookieHeader(guest.token),
    });
    const res = await injectAs(t.app, {
      method: 'POST',
      url: '/v1/auth/verify',
      payload: { token: tokenFromLink(t.mailer.last()!.link) },
      headers: cookieHeader(guest.token),
    });
    return { id: guest.profile.id as string, token: sessionCookie(res)! };
  }

  it('renames the player, accepting letters with accents', async () => {
    const { token } = await createGuest(t.app);
    const ok = await patchName(token, 'Córdoba_1');
    expect(ok.statusCode).toBe(200);
    expect(ok.json().displayName).toBe('Córdoba_1');
    expect((await patchName(token, 'ab')).statusCode).toBe(400);
    expect((await patchName(token, '<script>')).statusCode).toBe(400);
  });

  it('exports the player data as a downloadable JSON file', async () => {
    const { token, profile } = await createGuest(t.app);
    const res = await injectAs(t.app, {
      method: 'GET',
      url: '/v1/me/data-export',
      headers: cookieHeader(token),
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['cache-control']).toBe('no-store');
    const body = res.json();
    expect(body.account.id).toBe(profile.id);
    expect(body.player.display_name).toBe(profile.displayName);
    expect(body.sessions).toHaveLength(1);
    for (const key of ['creatures', 'inventory', 'goldLedger', 'locationSamples', 'riskSignals']) {
      expect(Array.isArray(body[key])).toBe(true);
    }
  });

  it('deletes a guest: personal data gone, ledger rows kept anonymous', async () => {
    const { token, profile } = await createGuest(t.app);
    await t.db.query(
      `INSERT INTO gold_ledger (user_id, amount, reason, ref_id) VALUES ($1, 5, 'test', gen_random_uuid())`,
      [profile.id],
    );
    await t.db.query(
      `INSERT INTO location_samples (user_id, h3_r9, geom) VALUES ($1, h3_lat_lng_to_cell(point(-4.78, 37.88), 9), ST_MakePoint(-4.78, 37.88)::geography)`,
      [profile.id],
    );

    expect((await del(token, 'yes')).statusCode).toBe(400);
    const res = await del(token);
    expect(res.statusCode).toBe(204);
    expect(
      (await injectAs(t.app, { method: 'GET', url: '/v1/me', headers: cookieHeader(token) }))
        .statusCode,
    ).toBe(401);

    const u = await t.db.query(`SELECT status, email, region FROM users WHERE id = $1`, [
      profile.id,
    ]);
    expect(u.rows[0]).toEqual({ status: 'deleted', email: null, region: null });
    const loc = await t.db.query(`SELECT 1 FROM location_samples WHERE user_id = $1`, [profile.id]);
    expect(loc.rowCount).toBe(0);
    const sess = await t.db.query(`SELECT 1 FROM sessions WHERE user_id = $1`, [profile.id]);
    expect(sess.rowCount).toBe(0);
    const ledger = await t.db.query(`SELECT 1 FROM gold_ledger WHERE user_id = $1`, [profile.id]);
    expect(ledger.rowCount).toBe(1);
  });

  it('asks registered players to sign in again before deleting', async () => {
    const { id, token } = await registered();
    await t.db.query(
      `UPDATE sessions SET created_at = now() - interval '1 hour' WHERE user_id = $1 AND revoked_at IS NULL`,
      [id],
    );
    const stale = await del(token);
    expect(stale.statusCode).toBe(403);
    expect(stale.json().code).toBe('reauth_required');

    await t.db.query(
      `UPDATE sessions SET created_at = now() WHERE user_id = $1 AND revoked_at IS NULL`,
      [id],
    );
    expect((await del(token)).statusCode).toBe(204);
    const u = await t.db.query(`SELECT email FROM users WHERE id = $1`, [id]);
    expect(u.rows[0].email).toBeNull();
  });

  it('frees the email after deletion so it can be used again', async () => {
    const guest = await createGuest(t.app);
    const email = randomEmail();
    await injectAs(t.app, {
      method: 'POST',
      url: '/v1/auth/magic-link',
      payload: { email },
      headers: cookieHeader(guest.token),
    });
    const v = await injectAs(t.app, {
      method: 'POST',
      url: '/v1/auth/verify',
      payload: { token: tokenFromLink(t.mailer.last()!.link) },
      headers: cookieHeader(guest.token),
    });
    expect((await del(sessionCookie(v)!)).statusCode).toBe(204);

    const other = await createGuest(t.app);
    await injectAs(t.app, {
      method: 'POST',
      url: '/v1/auth/magic-link',
      payload: { email },
      headers: cookieHeader(other.token),
    });
    const res = await injectAs(t.app, {
      method: 'POST',
      url: '/v1/auth/verify',
      payload: { token: tokenFromLink(t.mailer.last()!.link) },
      headers: cookieHeader(other.token),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().email).toBe(email);
  });
});
