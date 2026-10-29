import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '@nyrgo/shared';
import { syncContent } from '../src/modules/content/sync.js';
import { grantReward } from '../src/modules/progress/rewards.js';
import { runRetention } from '../src/jobs/retention.js';
import { withTx } from '../src/db.js';
import {
  TEST_DB_URL,
  cookieHeader,
  createGuest,
  injectAs,
  makeTestApp,
  type TestApp,
} from './helpers.js';

/** Somewhere with no imported OSM data, different for every run, so tests never share cells. */
const somewhere = () => ({
  lat: 40 + randomBytes(2).readUInt16BE(0) / 6000,
  lng: -3 + randomBytes(2).readUInt16BE(0) / 6000,
});
const north = (p: { lat: number; lng: number }, m: number) => ({
  lat: p.lat + m / 111_195,
  lng: p.lng,
});

describe.skipIf(!TEST_DB_URL)('spawns, encounters and captures', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await makeTestApp();
    await syncContent(t.db);
  });
  afterAll(() => t.close());

  async function player(at = somewhere()) {
    const g = await createGuest(t.app);
    const h = cookieHeader(g.token);
    const call = (method: 'GET' | 'POST', url: string, payload?: unknown, headers = {}) =>
      injectAs(t.app, { method, url, payload: payload as object, headers: { ...h, ...headers } });
    const fix = (p: { lat: number; lng: number }) =>
      call('POST', '/v1/world/nearby', { ...p, accuracy: 8 });
    return { id: g.profile.id as string, token: g.token, at, call, fix };
  }

  /** A known common creature right where we want it, live for the current window. */
  async function placeSpawn(p: { lat: number; lng: number }, creature = 'gwisp', level = 4) {
    const { rows } = await t.db.query<{ id: string }>(
      `INSERT INTO spawns (h3_r9, definition_id, level, geom, seed, window_start, expires_at)
       VALUES (h3_lat_lng_to_cell(ST_SetSRID(ST_MakePoint($2, $1), 4326), 9), $3, $4,
               ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography, $5,
               now() - interval '1 minute', now() + interval '10 minutes')
       RETURNING id`,
      [p.lat, p.lng, creature, level, randomBytes(6).readUIntBE(0, 6)],
    );
    return rows[0]!.id;
  }

  const key = () => `k-${randomUUID()}`;

  it('generates the same creatures for every player standing in the same place', async () => {
    // A few cells around a random spot are empty by chance; try another spot if so.
    let ra = { creatures: [] as { id: string }[] };
    let rb = ra;
    for (let i = 0; i < 4 && ra.creatures.length === 0; i++) {
      const at = somewhere();
      const a = await player(at);
      const b = await player(at);
      ra = (await a.fix(at)).json();
      rb = (await b.fix(at)).json();
    }
    expect(ra.creatures.length).toBeGreaterThan(0);
    expect(rb.creatures.map((c) => c.id)).toEqual(ra.creatures.map((c) => c.id));
    for (const c of ra.creatures as unknown as {
      distanceM: number;
      inRange: boolean;
      expiresAt: string;
    }[]) {
      expect(c.distanceM).toBeLessThanOrEqual(DEFAULT_CONFIG.world.visibleRadiusM);
      expect(c.inRange).toBe(c.distanceM <= DEFAULT_CONFIG.world.interactionRadiusM);
      expect(Date.parse(c.expiresAt)).toBeGreaterThan(Date.now());
    }
    // each cell and window is generated once
    const { rows } = await t.db.query(
      `SELECT h3_r9, window_start, count(*) FROM spawn_generations GROUP BY 1, 2 HAVING count(*) > 1`,
    );
    expect(rows).toHaveLength(0);
  });

  it('never places a creature inside an exclusion zone', async () => {
    const at = somewhere();
    // a school covering everything within 600 m
    await t.db.query(
      `INSERT INTO exclusion_zones (kind, source, geom)
       VALUES ('school', 'admin', ST_Multi(ST_Buffer(ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography, 600)::geometry)::geography)`,
      [at.lat, at.lng],
    );
    const p = await player(at);
    const res = (await p.fix(at)).json();
    expect(res.creatures).toHaveLength(0);
  });

  it('opens an encounter only within 40 m and records the creature as seen', async () => {
    const p = await player();
    const spawn = await placeSpawn(north(p.at, 60));
    await p.fix(p.at);
    const far = await p.call('POST', `/v1/spawns/${spawn}/encounter`);
    expect(far.statusCode).toBe(422);
    expect(far.json().code).toBe('too_far');

    const dex0 = (await p.call('GET', '/v1/me/dex')).json();
    expect(dex0.entries).toHaveLength(0);

    await t.db.query(
      `UPDATE location_samples SET created_at = created_at - interval '30 seconds' WHERE user_id = $1`,
      [p.id],
    );
    await p.fix(north(p.at, 30));
    const near = await p.call('POST', `/v1/spawns/${spawn}/encounter`);
    expect(near.statusCode).toBe(200);
    expect(near.json()).toMatchObject({
      creatureId: 'gwisp',
      level: 4,
      status: 'open',
      attempts: 0,
    });
    // the starter kit arrives with the first encounter
    expect(near.json().inventory).toContainEqual({ id: 'vault-basic', qty: 15 });
    const dex = (await p.call('GET', '/v1/me/dex')).json();
    expect(dex.entries).toEqual([
      expect.objectContaining({ creatureId: 'gwisp', caughtAt: null, caughtCount: 0 }),
    ]);
    // opening it again resumes the same encounter
    const again = await p.call('POST', `/v1/spawns/${spawn}/encounter`);
    expect(again.json().id).toBe(near.json().id);
  });

  it('lets parallel requests for the same encounter share one', async () => {
    const p = await player();
    const spawn = await placeSpawn(p.at);
    await p.fix(p.at);
    const res = await Promise.all(
      Array.from({ length: 4 }, () => p.call('POST', `/v1/spawns/${spawn}/encounter`)),
    );
    expect(res.map((r) => r.statusCode)).toEqual([200, 200, 200, 200]);
    expect(new Set(res.map((r) => r.json().id)).size).toBe(1);
  });

  it('needs a recent fix and a walking pace', async () => {
    const p = await player();
    const spawn = await placeSpawn(p.at);
    const none = await p.call('POST', `/v1/spawns/${spawn}/encounter`);
    expect(none.json().code).toBe('location_required');
    await p.fix(p.at);
    await t.db.query(
      `UPDATE player_movement SET locked_until = now() + interval '5 minutes' WHERE user_id = $1`,
      [p.id],
    );
    const locked = await p.call('POST', `/v1/spawns/${spawn}/encounter`);
    expect(locked.json().code).toBe('cooldown_active');
  });

  async function openEncounter(creature = 'gwisp') {
    const p = await player();
    const spawn = await placeSpawn(p.at, creature);
    await p.fix(p.at);
    const enc = (await p.call('POST', `/v1/spawns/${spawn}/encounter`)).json();
    return { p, spawn, enc };
  }

  it('requires an Idempotency-Key and never spends two vaults for one retried throw', async () => {
    const { p, enc } = await openEncounter('pebblock');
    const url = `/v1/encounters/${enc.id}/capture`;
    const body = { item: 'vault-basic', skill: 0.2 };
    const missing = await p.call('POST', url, body);
    expect(missing.statusCode).toBe(400);

    const k = key();
    const first = await p.call('POST', url, body, { 'idempotency-key': k });
    expect(first.statusCode).toBe(200);
    const replay = await p.call('POST', url, body, { 'idempotency-key': k });
    expect(replay.json()).toEqual(first.json());
    const { rows } = await t.db.query(
      `SELECT count(*)::int AS n FROM capture_attempts WHERE encounter_id = $1`,
      [enc.id],
    );
    expect(rows[0].n).toBe(1);
    const inv = (await p.call('GET', '/v1/me/inventory')).json();
    expect(inv.items).toContainEqual({ id: 'vault-basic', qty: 14 });

    const other = await p.call(
      'POST',
      url,
      { item: 'vault-basic', skill: 0.9 },
      { 'idempotency-key': k },
    );
    expect(other.statusCode).toBe(422);
    expect(other.json().code).toBe('idempotency_mismatch');
  });

  it('computes the chance on the server and stores every roll', async () => {
    const { p, enc } = await openEncounter('gwisp');
    const res = (
      await p.call(
        'POST',
        `/v1/encounters/${enc.id}/capture`,
        { item: 'vault-basic', skill: 0 },
        { 'idempotency-key': key() },
      )
    ).json();
    const { rows } = await t.db.query(
      `SELECT chance, roll, success, item_id, skill_score FROM capture_attempts WHERE encounter_id = $1`,
      [enc.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].success).toBe(rows[0].roll < rows[0].chance);
    expect(res.result).toBe(rows[0].success ? 'caught' : res.result);
    expect(['caught', 'escaped', 'fled']).toContain(res.result);
    expect(res.chance).toBeCloseTo(rows[0].chance, 2);
    expect(res.chance).toBeGreaterThanOrEqual(DEFAULT_CONFIG.capture.minChance);
    expect(res.chance).toBeLessThanOrEqual(DEFAULT_CONFIG.capture.maxChance);
  });

  it('adds a caught creature to the collection and the Dex, pays XP and Gold, and hides it for that player', async () => {
    // Cold vault, perfect timing, a common creature: 95 % per throw. Retry with a new spawn
    // in the rare case it runs away.
    let caught: {
      p: Awaited<ReturnType<typeof player>>;
      spawn: string;
      enc: { id: string };
      res: Record<string, unknown>;
    } | null = null;
    for (let tries = 0; tries < 10 && !caught; tries++) {
      const { p, spawn, enc } = await openEncounter('gwisp');
      await t.db.query(
        `INSERT INTO inventory (user_id, item_id, qty) VALUES ($1, 'vault-cold', 5)`,
        [p.id],
      );
      for (let i = 0; i < 5; i++) {
        const res = (
          await p.call(
            'POST',
            `/v1/encounters/${enc.id}/capture`,
            { item: 'vault-cold', skill: 1 },
            { 'idempotency-key': key() },
          )
        ).json();
        if (res.result === 'caught') {
          caught = { p, spawn, enc, res };
          break;
        }
        if (res.result === 'fled') break;
      }
    }
    expect(caught).not.toBeNull();
    const { p, spawn, enc, res } = caught!;
    expect(res.creature).toMatchObject({ creatureId: 'gwisp', level: 4, acquiredVia: 'capture' });
    expect((res.reward as { xp: number }).xp).toBe(
      DEFAULT_CONFIG.economy.rewards.captureSuccess.xp,
    );

    const mine = (await p.call('GET', '/v1/me/creatures')).json();
    expect(mine.creatures).toHaveLength(1);
    const c = mine.creatures[0];
    for (const v of Object.values(c.ivs) as number[]) expect(v).toBeGreaterThanOrEqual(0);
    expect(c.hp).toBe(c.stats.hp);

    const dex = (await p.call('GET', '/v1/me/dex')).json();
    expect(dex.entries[0]).toMatchObject({ creatureId: 'gwisp', caughtCount: 1 });

    // 100 XP takes a new player to level 2, which pays 20 × 2 Gold on top of the capture
    const me = (await p.call('GET', '/v1/me')).json();
    expect(me).toMatchObject({ level: 2, xp: 100, gold: 50 });
    const ledger = await t.db.query(
      `SELECT amount, reason FROM gold_ledger WHERE user_id = $1 ORDER BY id`,
      [p.id],
    );
    expect(ledger.rows).toEqual([
      { amount: '10', reason: 'capture' },
      { amount: '40', reason: 'level_up' },
    ]);

    const again = await p.call(
      'POST',
      `/v1/encounters/${enc.id}/capture`,
      { item: 'vault-cold', skill: 1 },
      { 'idempotency-key': key() },
    );
    expect(again.json().code).toBe('already_caught');
    const reopen = await p.call('POST', `/v1/spawns/${spawn}/encounter`);
    expect(reopen.json().code).toBe('already_caught');

    // gone for this player, still there for someone else in the same spot
    const mineNow = (await p.fix(p.at)).json();
    expect(mineNow.creatures.map((x: { id: string }) => x.id)).not.toContain(spawn);
    const other = await player(p.at);
    const theirs = (await other.fix(p.at)).json();
    expect(theirs.creatures.map((x: { id: string }) => x.id)).toContain(spawn);
  });

  it('refuses a throw with no vaults left and spends nothing', async () => {
    const { p, enc } = await openEncounter();
    await t.db.query(
      `UPDATE inventory SET qty = 0 WHERE user_id = $1 AND item_id = 'vault-basic'`,
      [p.id],
    );
    const res = await p.call(
      'POST',
      `/v1/encounters/${enc.id}/capture`,
      { item: 'vault-basic', skill: 0.5 },
      { 'idempotency-key': key() },
    );
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('out_of_items');
    const { rows } = await t.db.query(
      `SELECT count(*)::int AS n FROM capture_attempts WHERE encounter_id = $1`,
      [enc.id],
    );
    expect(rows[0].n).toBe(0);
  });

  it('refuses throws at someone else’s encounter and after the creature has gone', async () => {
    const { enc } = await openEncounter();
    const stranger = await player();
    await stranger.fix(stranger.at);
    const res = await stranger.call(
      'POST',
      `/v1/encounters/${enc.id}/capture`,
      { item: 'vault-basic', skill: 0.5 },
      { 'idempotency-key': key() },
    );
    expect(res.statusCode).toBe(404);

    const late = await openEncounter();
    await t.db.query(
      `UPDATE encounters SET expires_at = now() - interval '1 second' WHERE id = $1`,
      [late.enc.id],
    );
    const gone = await late.p.call(
      'POST',
      `/v1/encounters/${late.enc.id}/capture`,
      { item: 'vault-basic', skill: 0.5 },
      { 'idempotency-key': key() },
    );
    expect(gone.json().code).toBe('spawn_expired');
  });

  it('lets each player pick one starter', async () => {
    const p = await player();
    const bad = await p.call('POST', '/v1/me/starter', { creatureId: 'zeroknowl' });
    expect(bad.statusCode).toBe(400);
    const ok = await p.call('POST', '/v1/me/starter', { creatureId: 'frostkey' });
    expect(ok.statusCode).toBe(201);
    expect(ok.json()).toMatchObject({ creatureId: 'frostkey', level: 5, acquiredVia: 'starter' });
    const twice = await p.call('POST', '/v1/me/starter', { creatureId: 'gwisp' });
    expect(twice.statusCode).toBe(409);
    expect(twice.json().code).toBe('starter_taken');
    const dex = (await p.call('GET', '/v1/me/dex')).json();
    expect(dex.entries).toEqual([
      expect.objectContaining({ creatureId: 'frostkey', caughtCount: 1 }),
    ]);
  });

  it('grants the starter kit exactly once', async () => {
    const p = await player();
    const a = (await p.call('GET', '/v1/me/inventory')).json();
    const b = (await p.call('GET', '/v1/me/inventory')).json();
    expect(a.items).toEqual([
      { id: 'patch', qty: 3 },
      { id: 'vault-basic', qty: 15 },
    ]);
    expect(b).toEqual(a);
  });

  it('caps gameplay Gold per day and pays level-ups', async () => {
    const p = await player();
    const r1 = await withTx(t.db, (c) =>
      grantReward(c, p.id, { xp: 350, gold: 1000, reason: 'test', refId: randomUUID() }),
    );
    // 350 XP: level 3 (needs 300); level-ups pay 20×2 + 20×3
    expect(r1).toMatchObject({ level: 3, leveledUp: true, gold: 1100, goldCapped: 0 });
    const r2 = await withTx(t.db, (c) =>
      grantReward(c, p.id, { xp: 0, gold: 1000, reason: 'test', refId: randomUUID() }),
    );
    expect(r2.gold).toBe(DEFAULT_CONFIG.economy.dailyGameplayGoldCap - 1100);
    expect(r2.goldCapped).toBe(1000 - r2.gold);
    const me = (await p.call('GET', '/v1/me')).json();
    expect(me.gold).toBe(DEFAULT_CONFIG.economy.dailyGameplayGoldCap);
  });

  it('exports and deletes the collection, Dex and encounters with the account', async () => {
    const { p } = await openEncounter();
    await p.call('POST', '/v1/me/starter', { creatureId: 'gwisp' });
    const exp = (await p.call('GET', '/v1/me/data-export')).json();
    expect(exp.creatures).toHaveLength(1);
    expect(exp.dex.length).toBeGreaterThan(0);
    expect(exp.encounters).toHaveLength(1);
    const del = await p.call('DELETE' as 'POST', '/v1/me', { confirm: 'DELETE' });
    expect(del.statusCode).toBe(204);
    for (const table of ['creature_instances', 'dex_entries', 'encounters']) {
      const col = table === 'creature_instances' ? 'owner_id' : 'user_id';
      const { rows } = await t.db.query(
        `SELECT count(*)::int AS n FROM ${table} WHERE ${col} = $1`,
        [p.id],
      );
      expect(rows[0].n, table).toBe(0);
    }
  });

  it('drops old spawns with their encounters and attempts', async () => {
    const { p, spawn, enc } = await openEncounter();
    await p.call(
      'POST',
      `/v1/encounters/${enc.id}/capture`,
      { item: 'vault-basic', skill: 0.5 },
      { 'idempotency-key': key() },
    );
    await t.db.query(
      `UPDATE spawns SET window_start = now() - interval '100 days', expires_at = now() - interval '99 days' WHERE id = $1`,
      [spawn],
    );
    const report = await runRetention(t.db);
    expect(report.spawnsDeleted).toBeGreaterThanOrEqual(1);
    const left = await t.db.query(
      `SELECT (SELECT count(*) FROM encounters WHERE spawn_id = $1)::int AS e,
              (SELECT count(*) FROM capture_attempts WHERE spawn_id = $1)::int AS a`,
      [spawn],
    );
    expect(left.rows[0]).toEqual({ e: 0, a: 0 });
  });
});
