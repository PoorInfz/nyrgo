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

describe.skipIf(!TEST_DB_URL)('accounts and sessions', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await makeTestApp();
  });
  afterAll(() => t.close());

  const requestLink = (email: string, token?: string) =>
    injectAs(t.app, {
      method: 'POST',
      url: '/v1/auth/magic-link',
      payload: { email },
      headers: token ? cookieHeader(token) : {},
    });

  const verify = (linkToken: string, token?: string) =>
    injectAs(t.app, {
      method: 'POST',
      url: '/v1/auth/verify',
      payload: { token: linkToken },
      headers: token ? cookieHeader(token) : {},
    });

  const me = (token: string) =>
    injectAs(t.app, { method: 'GET', url: '/v1/me', headers: cookieHeader(token) });

  describe('guest accounts', () => {
    it('creates a guest with an httpOnly session cookie', async () => {
      const { res, token, profile } = await createGuest(t.app);
      expect(res.statusCode).toBe(201);
      const c = res.cookies.find((x) => x.name === 'nyrgo_session')!;
      expect(c.httpOnly).toBe(true);
      expect(c.sameSite).toBe('Lax');
      expect(profile).toMatchObject({
        kind: 'guest',
        email: null,
        ageBand: '18+',
        region: 'ES',
        canUseWeb3: true,
        level: 1,
        gold: 0,
      });
      expect(profile.displayName).toMatch(/^Explorer-[0-9a-f]{6}$/);
      const again = await me(token);
      expect(again.statusCode).toBe(200);
      expect(again.json().id).toBe(profile.id);
    });

    it('requires a session for /v1/me', async () => {
      const res = await injectAs(t.app, { method: 'GET', url: '/v1/me' });
      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe('unauthenticated');
    });

    it('stores only an age band and hides web3 from minors', async () => {
      const year = new Date().getUTCFullYear() - 16;
      const { profile } = await createGuest(t.app, year);
      expect(profile.ageBand).toMatch(/^(13-15|16-17)$/);
      expect(profile.canUseWeb3).toBe(false);
      const cols = await t.db.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name = 'users'`,
      );
      expect(cols.rows.map((r) => r.column_name)).not.toContain('birth_year');
    });

    it('refuses players under the minimum age for Spain', async () => {
      const res = await injectAs(t.app, {
        method: 'POST',
        url: '/v1/auth/guest',
        payload: { birthYear: new Date().getUTCFullYear() - 12, birthMonth: 1 },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ code: 'age_restricted' });
      expect(sessionCookie(res)).toBeUndefined();
    });

    it('rejects unknown fields', async () => {
      const res = await injectAs(t.app, {
        method: 'POST',
        url: '/v1/auth/guest',
        payload: { birthYear: 1990, birthMonth: 1, isAdmin: true },
      });
      expect(res.statusCode).toBe(400);
    });

    it('refuses creating a guest while signed in', async () => {
      const { token } = await createGuest(t.app);
      const res = await injectAs(t.app, {
        method: 'POST',
        url: '/v1/auth/guest',
        payload: { birthYear: 1990, birthMonth: 1 },
        headers: cookieHeader(token),
      });
      expect(res.statusCode).toBe(409);
    });
  });

  describe('magic links', () => {
    it('upgrades a guest to a registered account and rotates the session', async () => {
      const guest = await createGuest(t.app);
      const email = randomEmail();
      const req = await requestLink(email, guest.token);
      expect(req.statusCode).toBe(202);
      const link = t.mailer.last()!;
      expect(link.to).toBe(email);
      expect(link.link).toMatch(/^http:\/\/app\.test\/auth\/verify\?token=/);

      const res = await verify(tokenFromLink(link.link), guest.token);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ id: guest.profile.id, kind: 'registered', email });

      const fresh = sessionCookie(res)!;
      expect(fresh).not.toBe(guest.token);
      expect((await me(guest.token)).statusCode).toBe(401);
      expect((await me(fresh)).json().kind).toBe('registered');
    });

    it('signs an existing account in from a new device', async () => {
      const guest = await createGuest(t.app);
      const email = randomEmail();
      await requestLink(email, guest.token);
      await verify(tokenFromLink(t.mailer.last()!.link), guest.token);

      await requestLink(email.toUpperCase()); // case-insensitive, no session
      const res = await verify(tokenFromLink(t.mailer.last()!.link));
      expect(res.statusCode).toBe(200);
      expect(res.json().id).toBe(guest.profile.id);
      expect(sessionCookie(res)).toBeDefined();
    });

    it('accepts each link once', async () => {
      const guest = await createGuest(t.app);
      await requestLink(randomEmail(), guest.token);
      const tok = tokenFromLink(t.mailer.last()!.link);
      expect((await verify(tok, guest.token)).statusCode).toBe(200);
      const second = await verify(tok);
      expect(second.statusCode).toBe(400);
      expect(second.json().code).toBe('invalid_token');
    });

    it('rejects expired and malformed links', async () => {
      const guest = await createGuest(t.app);
      const email = randomEmail();
      await requestLink(email, guest.token);
      const tok = tokenFromLink(t.mailer.last()!.link);
      await t.db.query(
        `UPDATE magic_links SET created_at = now() - interval '1 hour', expires_at = now() - interval '30 minutes' WHERE email = $1`,
        [email],
      );
      expect((await verify(tok, guest.token)).statusCode).toBe(400);
      expect((await verify('not-a-token')).json().code).toBe('invalid_token');
    });

    it('answers the same for unknown emails and sends no sign-in link', async () => {
      const email = randomEmail();
      const before = t.mailer.sent.length;
      const res = await requestLink(email);
      expect(res.statusCode).toBe(202);
      expect(res.json()).toEqual({ sent: true });
      expect(t.mailer.sent.length).toBe(before + 1);
      expect(t.mailer.last()!.link).toBeUndefined();
      const rows = await t.db.query(`SELECT 1 FROM magic_links WHERE email = $1`, [email]);
      expect(rows.rowCount).toBe(0);
    });

    it('throttles links per address', async () => {
      const guest = await createGuest(t.app);
      const email = randomEmail();
      for (let i = 0; i < 4; i++) await requestLink(email, guest.token);
      const rows = await t.db.query(`SELECT 1 FROM magic_links WHERE email = $1`, [email]);
      expect(rows.rowCount).toBe(3);
    });

    it('refuses to attach an email that another account claimed first', async () => {
      const a = await createGuest(t.app);
      const b = await createGuest(t.app);
      const email = randomEmail();
      await requestLink(email, a.token);
      const linkA = tokenFromLink(t.mailer.last()!.link);
      await requestLink(email, b.token);
      const linkB = tokenFromLink(t.mailer.last()!.link);
      expect((await verify(linkA, a.token)).statusCode).toBe(200);
      const res = await verify(linkB, b.token);
      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe('email_taken');
    });
  });

  describe('session hygiene', () => {
    it('logout revokes the session and clears the cookie', async () => {
      const { token } = await createGuest(t.app);
      const res = await injectAs(t.app, {
        method: 'POST',
        url: '/v1/auth/logout',
        headers: cookieHeader(token),
      });
      expect(res.statusCode).toBe(204);
      const cleared = res.cookies.find((c) => c.name === 'nyrgo_session');
      expect(cleared?.value).toBe('');
      expect((await me(token)).statusCode).toBe(401);
    });

    it('stores only token hashes', async () => {
      const { token } = await createGuest(t.app);
      const { rows } = await t.db.query(
        `SELECT count(*)::int AS n FROM sessions WHERE encode(token_hash, 'escape') = $1`,
        [token],
      );
      expect(rows[0].n).toBe(0);
    });

    it('refuses state-changing requests from foreign origins', async () => {
      const res = await injectAs(t.app, {
        method: 'POST',
        url: '/v1/auth/guest',
        payload: { birthYear: 1990, birthMonth: 1 },
        headers: { origin: 'https://evil.test' },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe('bad_origin');
    });

    it('accepts our own origin', async () => {
      const res = await injectAs(t.app, {
        method: 'POST',
        url: '/v1/auth/guest',
        payload: { birthYear: 1990, birthMonth: 1 },
        headers: { origin: 'http://app.test' },
      });
      expect(res.statusCode).toBe(201);
    });

    it('limits guest creation to 10 per hour per IP', async () => {
      const ip = '10.250.250.250';
      const codes: number[] = [];
      for (let i = 0; i < 11; i++) {
        const res = await t.app.inject({
          method: 'POST',
          url: '/v1/auth/guest',
          payload: { birthYear: 1990, birthMonth: 1 },
          remoteAddress: ip,
        });
        codes.push(res.statusCode);
      }
      expect(codes.slice(0, 10).every((c) => c === 201)).toBe(true);
      expect(codes.at(-1)).toBe(429);
    });
  });
});
