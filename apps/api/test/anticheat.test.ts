import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { requireInteractable } from '../src/modules/anticheat/movement.js';
import { decayAllRisk, recordSignals } from '../src/modules/anticheat/risk.js';
import {
  TEST_DB_URL,
  cookieHeader,
  createGuest,
  injectAs,
  makeTestApp,
  type TestApp,
} from './helpers.js';

const TENDILLAS = { lat: 37.8847, lng: -4.7792 };
const north = (m: number) => ({ lat: TENDILLAS.lat + m / 111_195, lng: TENDILLAS.lng });

describe.skipIf(!TEST_DB_URL)('movement checks', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await makeTestApp();
  });
  afterAll(() => t.close());

  async function player() {
    const g = await createGuest(t.app);
    const fix = (p: { lat: number; lng: number }, extra: Record<string, unknown> = {}) =>
      injectAs(t.app, {
        method: 'POST',
        url: '/v1/world/nearby',
        payload: { lat: p.lat, lng: p.lng, accuracy: 5, ...extra },
        headers: cookieHeader(g.token),
      });
    /** Pretends the previous fixes were taken `s` seconds earlier. */
    const wait = (s: number) =>
      t.db.query(
        `UPDATE location_samples SET created_at = created_at - make_interval(secs => $2) WHERE user_id = $1`,
        [g.profile.id, s],
      );
    const signals = async () =>
      (
        await t.db.query<{ kind: string }>(
          `SELECT kind FROM risk_signals WHERE user_id = $1 ORDER BY id`,
          [g.profile.id],
        )
      ).rows.map((r) => r.kind);
    const user = async () =>
      (
        await t.db.query<{ risk_level: number; status: string }>(
          `SELECT risk_level, status FROM users WHERE id = $1`,
          [g.profile.id],
        )
      ).rows[0]!;
    return { id: g.profile.id as string, fix, wait, signals, user };
  }

  it('lets a walking player interact', async () => {
    const p = await player();
    await p.fix(TENDILLAS);
    await p.wait(60);
    const res = await p.fix(north(70));
    expect(res.json().movement).toMatchObject({ interactable: true, reason: null });
    expect(res.json().movement.speedKmh).toBeLessThan(6);
    await expect(requireInteractable(t.db, p.id)).resolves.toBeUndefined();
  });

  it('pauses interactions at driving speed, with no signal and no risk', async () => {
    const p = await player();
    await p.fix(TENDILLAS);
    await p.wait(36);
    const res = await p.fix(north(510));
    expect(res.json().movement).toMatchObject({ interactable: false, reason: 'speed' });
    expect(res.json().pois.every((x: { inRange: boolean }) => !x.inRange)).toBe(true);
    expect(await p.signals()).toEqual([]);
    expect((await p.user()).risk_level).toBe(0);
    await expect(requireInteractable(t.db, p.id)).rejects.toMatchObject({
      code: 'speed_implausible',
    });
  });

  it('pauses interactions for 5 minutes after a jump and records one weak signal', async () => {
    const p = await player();
    await p.fix(TENDILLAS);
    await p.wait(30);
    const jump = await p.fix(north(5_000));
    const m = jump.json().movement;
    expect(m).toMatchObject({ interactable: false, reason: 'teleport_cooldown' });
    const lockS = (Date.parse(m.lockedUntil) - Date.now()) / 1000;
    expect(lockS).toBeGreaterThan(280);
    expect(lockS).toBeLessThan(320);
    expect(await p.signals()).toEqual(['teleport']);
    expect((await p.user()).risk_level).toBe(15);

    // walking normally afterwards does not lift the cooldown early
    await p.wait(60);
    expect((await p.fix(north(5_050))).json().movement.reason).toBe('teleport_cooldown');
    await expect(requireInteractable(t.db, p.id)).rejects.toMatchObject({
      code: 'cooldown_active',
    });

    // once it expires, play resumes
    await t.db.query(
      `UPDATE player_movement SET locked_until = now() - interval '1 second' WHERE user_id = $1`,
      [p.id],
    );
    await p.wait(60);
    expect((await p.fix(north(5_100))).json().movement).toMatchObject({ interactable: true });
  });

  it('records the same kind of signal at most once an hour', async () => {
    const p = await player();
    await p.fix(TENDILLAS);
    await p.wait(30);
    await p.fix(north(5_000));
    await p.wait(30);
    await p.fix(TENDILLAS);
    expect(await p.signals()).toEqual(['teleport']);
  });

  it('flags a client clock that is far off', async () => {
    const p = await player();
    await p.fix(TENDILLAS, { timestamp: Date.now() - 10 * 60_000 });
    expect(await p.signals()).toEqual(['clock_skew']);
  });

  it('requires a recent fix before any interaction', async () => {
    const p = await player();
    await expect(requireInteractable(t.db, p.id)).rejects.toMatchObject({
      code: 'location_required',
    });
    await p.fix(TENDILLAS);
    await t.db.query(
      `UPDATE player_movement SET last_fix_at = now() - interval '2 minutes' WHERE user_id = $1`,
      [p.id],
    );
    await expect(requireInteractable(t.db, p.id)).rejects.toMatchObject({
      code: 'location_required',
    });
  });

  it('opens one review case at the threshold and never suspends the account', async () => {
    const p = await player();
    for (const minutesAgo of [61, 122, 183]) {
      await t.db.query(
        `INSERT INTO risk_signals (user_id, kind, score, created_at)
         VALUES ($1, 'impossible_speed', 30, now() - make_interval(mins => $2))`,
        [p.id, minutesAgo],
      );
    }
    const risk = await recordSignals(t.db, p.id, [{ kind: 'teleport', score: 15, detail: {} }]);
    expect(risk).toBeGreaterThanOrEqual(70);
    await recordSignals(t.db, p.id, [{ kind: 'clock_skew', score: 3, detail: {} }]);
    const cases = await t.db.query(`SELECT status, reason FROM review_cases WHERE user_id = $1`, [
      p.id,
    ]);
    expect(cases.rows).toEqual([{ status: 'open', reason: 'risk_threshold' }]);
    expect((await p.user()).status).toBe('active');
  });

  it('lets risk fade over time', async () => {
    const p = await player();
    await t.db.query(
      `INSERT INTO risk_signals (user_id, kind, score, created_at) VALUES ($1, 'teleport', 40, now())`,
      [p.id],
    );
    await t.db.query(`UPDATE users SET risk_level = 40 WHERE id = $1`, [p.id]);
    // two half-lives later
    await t.db.query(
      `UPDATE risk_signals SET created_at = now() - interval '144 hours' WHERE user_id = $1`,
      [p.id],
    );
    await decayAllRisk(t.db);
    expect((await p.user()).risk_level).toBe(10);
  });

  it('erases movement state and review cases with the account', async () => {
    const g = await createGuest(t.app);
    await injectAs(t.app, {
      method: 'POST',
      url: '/v1/world/nearby',
      payload: { ...TENDILLAS, accuracy: 5 },
      headers: cookieHeader(g.token),
    });
    await t.db.query(
      `INSERT INTO review_cases (user_id, reason, risk_at_open) VALUES ($1, 'risk_threshold', 80)`,
      [g.profile.id],
    );
    const del = await injectAs(t.app, {
      method: 'DELETE',
      url: '/v1/me',
      payload: { confirm: 'DELETE' },
      headers: cookieHeader(g.token),
    });
    expect(del.statusCode).toBe(204);
    for (const table of ['player_movement', 'review_cases', 'location_samples']) {
      const r = await t.db.query(`SELECT 1 FROM ${table} WHERE user_id = $1`, [g.profile.id]);
      expect(r.rowCount, table).toBe(0);
    }
  });
});
