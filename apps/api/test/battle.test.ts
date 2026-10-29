import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, battleXp, creatureXpForLevel } from '@nyrgo/shared';
import { syncContent } from '../src/modules/content/sync.js';
import {
  TEST_DB_URL,
  cookieHeader,
  createGuest,
  injectAs,
  makeTestApp,
  type TestApp,
} from './helpers.js';

const somewhere = () => ({
  lat: 40 + randomBytes(2).readUInt16BE(0) / 6000,
  lng: -3 + randomBytes(2).readUInt16BE(0) / 6000,
});
const key = () => `k-${randomUUID()}`;

describe.skipIf(!TEST_DB_URL)('battles', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await makeTestApp();
    await syncContent(t.db);
  });
  afterAll(() => t.close());

  /** A player standing next to a wild creature, with an open encounter and one creature of their own. */
  async function setup(opts: { foe?: string; foeLevel?: number; mineLevel?: number } = {}) {
    const g = await createGuest(t.app);
    const at = somewhere();
    const id = g.profile.id as string;
    const call = (method: 'GET' | 'POST', url: string, payload?: unknown, headers = {}) =>
      injectAs(t.app, {
        method,
        url,
        payload: payload as object,
        headers: { ...cookieHeader(g.token), ...headers },
      });
    const { rows } = await t.db.query<{ id: string }>(
      `INSERT INTO spawns (h3_r9, definition_id, level, geom, seed, window_start, expires_at)
       VALUES (h3_lat_lng_to_cell(ST_SetSRID(ST_MakePoint($2, $1), 4326), 9), $3, $4,
               ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography, $5,
               now() - interval '1 minute', now() + interval '10 minutes')
       RETURNING id`,
      [at.lat, at.lng, opts.foe ?? 'gwisp', opts.foeLevel ?? 4, randomBytes(6).readUIntBE(0, 6)],
    );
    await call('POST', '/v1/world/nearby', { ...at, accuracy: 8 });
    const enc = (await call('POST', `/v1/spawns/${rows[0]!.id}/encounter`)).json();
    const starter = (await call('POST', '/v1/me/starter', { creatureId: 'frostkey' })).json();
    if (opts.mineLevel) {
      const lv = opts.mineLevel;
      await t.db.query(
        `UPDATE creature_instances SET level = $2, xp = $3, hp_current = 9999 WHERE id = $1`,
        [starter.id, lv, creatureXpForLevel(lv)],
      );
    }
    const turn = (battleId: string, action: unknown, k = key()) =>
      call('POST', `/v1/battles/${battleId}/turn`, { action }, { 'idempotency-key': k });
    return { id, call, enc, mine: starter.id as string, spawn: rows[0]!.id, turn };
  }

  /** Attacks with the first skill until the battle ends. */
  async function fight(s: Awaited<ReturnType<typeof setup>>) {
    const start = (
      await s.call('POST', `/v1/encounters/${s.enc.id}/battle`, { creature: s.mine })
    ).json();
    let last = start;
    for (let i = 0; i < 60 && !last.result; i++) {
      last = (await s.turn(start.id, { kind: 'skill', skill: start.player.skills[0] })).json();
    }
    return { start, last };
  }

  it('starts a battle between the player’s creature and the wild one, without exposing the seed', async () => {
    const s = await setup();
    const res = await s.call('POST', `/v1/encounters/${s.enc.id}/battle`, { creature: s.mine });
    expect(res.statusCode).toBe(200);
    const b = res.json();
    expect(b).toMatchObject({ turn: 0, result: null });
    expect(b.player.creatureId).toBe('frostkey');
    expect(b.foe).toMatchObject({ creatureId: 'gwisp', level: 4 });
    expect(b.foe.hp).toBe(b.foe.maxHp);
    expect(JSON.stringify(b)).not.toContain('seed');
    // asking again resumes the same battle
    const again = (
      await s.call('POST', `/v1/encounters/${s.enc.id}/battle`, { creature: s.mine })
    ).json();
    expect(again.id).toBe(b.id);
  });

  it('starts one battle when two requests arrive at once', async () => {
    const s = await setup();
    const res = await Promise.all(
      [1, 2, 3].map(() =>
        s.call('POST', `/v1/encounters/${s.enc.id}/battle`, { creature: s.mine }),
      ),
    );
    expect(res.map((r) => r.statusCode)).toEqual([200, 200, 200]);
    expect(new Set(res.map((r) => r.json().id)).size).toBe(1);
  });

  it('needs an Idempotency-Key per turn and replays a retried turn', async () => {
    const s = await setup();
    const b = (
      await s.call('POST', `/v1/encounters/${s.enc.id}/battle`, { creature: s.mine })
    ).json();
    const url = `/v1/battles/${b.id}/turn`;
    const action = { kind: 'skill', skill: b.player.skills[0] };
    expect((await s.call('POST', url, { action })).statusCode).toBe(400);
    const k = key();
    const first = (await s.turn(b.id, action, k)).json();
    const replay = (await s.turn(b.id, action, k)).json();
    expect(replay).toEqual(first);
    expect(first.turn).toBe(1);
    expect(first.events.length).toBeGreaterThan(0);
    const { rows } = await t.db.query(`SELECT turn FROM battles WHERE id = $1`, [b.id]);
    expect(rows[0].turn).toBe(1);
  });

  it('refuses skills the creature does not know', async () => {
    const s = await setup();
    const b = (
      await s.call('POST', `/v1/encounters/${s.enc.id}/battle`, { creature: s.mine })
    ).json();
    const res = await s.turn(b.id, { kind: 'skill', skill: 'genesis-quake' });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe('invalid_action');
  });

  it('pays a win: creature XP, a player reward, and a worn-out creature that is easier to catch', async () => {
    const s = await setup({ mineLevel: 40 });
    const { start, last } = await fight(s);
    expect(last.result).toBe('win');
    expect(last.creatureXp).toMatchObject({ xp: battleXp(4) });
    expect(last.reward).toMatchObject({ xp: DEFAULT_CONFIG.economy.rewards.pveWin.xp });
    const ledger = await t.db.query(`SELECT reason FROM gold_ledger WHERE user_id = $1`, [s.id]);
    expect(ledger.rows.map((r) => r.reason)).toContain('pve_win');

    const enc = await t.db.query(
      `SELECT foe_hp, foe_max_hp, won_at FROM encounters WHERE id = $1`,
      [s.enc.id],
    );
    expect(enc.rows[0]).toMatchObject({ foe_hp: 0, foe_max_hp: start.foe.maxHp });
    expect(enc.rows[0].won_at).not.toBeNull();

    // no second rewarded battle against the same creature
    const again = await s.call('POST', `/v1/encounters/${s.enc.id}/battle`, { creature: s.mine });
    expect(again.json().code).toBe('already_won');

    // the throw now gets the full weakness bonus (×2 before the cap)
    const thr = (
      await s.call(
        'POST',
        `/v1/encounters/${s.enc.id}/capture`,
        { item: 'vault-basic', skill: 0 },
        { 'idempotency-key': key() },
      )
    ).json();
    const fresh = await setup();
    const thrFresh = (
      await fresh.call(
        'POST',
        `/v1/encounters/${fresh.enc.id}/capture`,
        { item: 'vault-basic', skill: 0 },
        { 'idempotency-key': key() },
      )
    ).json();
    expect(thr.chance).toBeCloseTo(
      Math.min(DEFAULT_CONFIG.capture.maxChance, thrFresh.chance * 2),
      2,
    );
  });

  it('leaves a losing creature exhausted until it rests', async () => {
    const s = await setup({ foe: 'deflagron', foeLevel: 35 });
    const { last } = await fight(s);
    expect(last.result).toBe('loss');
    const mine = (await s.call('GET', '/v1/me/creatures')).json().creatures[0];
    expect(mine.hp).toBe(0);
    const res = await s.call('POST', `/v1/encounters/${s.enc.id}/battle`, { creature: s.mine });
    expect(res.json().code).toBe('creature_exhausted');
    // twenty minutes later it has recovered 4 × 10 %
    await t.db.query(
      `UPDATE creature_instances SET hp_updated_at = now() - interval '20 minutes' WHERE id = $1`,
      [s.mine],
    );
    const rested = (await s.call('GET', '/v1/me/creatures')).json().creatures[0];
    expect(rested.hp).toBe(Math.ceil(0.4 * rested.maxHp));
  });

  it('heals in battle with a patch and spends it', async () => {
    const s = await setup();
    await s.call('GET', '/v1/me/inventory');
    const b = (
      await s.call('POST', `/v1/encounters/${s.enc.id}/battle`, { creature: s.mine })
    ).json();
    expect(b.items).toEqual({ patch: 3 });
    const r = (await s.turn(b.id, { kind: 'item', item: 'patch' })).json();
    expect(r.items).toEqual({ patch: 2 });
    expect(r.events[0]).toEqual({ type: 'item', side: 'player', item: 'patch' });
    const inv = (await s.call('GET', '/v1/me/inventory')).json();
    expect(inv.items).toContainEqual({ id: 'patch', qty: 2 });
  });

  it('blocks throws during a battle and allows them after fleeing', async () => {
    const s = await setup();
    const b = (
      await s.call('POST', `/v1/encounters/${s.enc.id}/battle`, { creature: s.mine })
    ).json();
    const blocked = await s.call(
      'POST',
      `/v1/encounters/${s.enc.id}/capture`,
      { item: 'vault-basic', skill: 0.5 },
      { 'idempotency-key': key() },
    );
    expect(blocked.json().code).toBe('battle_active');
    let last = b;
    for (let i = 0; i < 30 && last.result !== 'fled'; i++) {
      last = (await s.turn(b.id, { kind: 'flee' })).json();
      if (last.result && last.result !== 'fled') break;
    }
    expect(['fled', 'loss']).toContain(last.result);
    const ok = await s.call(
      'POST',
      `/v1/encounters/${s.enc.id}/capture`,
      { item: 'vault-basic', skill: 0.5 },
      { 'idempotency-key': key() },
    );
    expect(ok.statusCode).toBe(200);
  });

  it('heals outside battle with a patch', async () => {
    const s = await setup();
    await s.call('GET', '/v1/me/inventory');
    await t.db.query(
      `UPDATE creature_instances SET hp_current = 1, hp_updated_at = now() WHERE id = $1`,
      [s.mine],
    );
    const res = await s.call('POST', `/v1/me/creatures/${s.mine}/heal`, { item: 'patch' });
    expect(res.statusCode).toBe(200);
    expect(res.json().hp).toBe(Math.min(res.json().maxHp, 31));
  });

  it('stops paying rewards after the daily cap of wins', async () => {
    const s = await setup({ mineLevel: 40 });
    const cap = DEFAULT_CONFIG.economy.rewards.pveWin.dailyCap;
    await t.db.query(
      `INSERT INTO battles (user_id, kind, seed, result, rewarded, finished_at)
       SELECT $1, 'wild', g, 'win', true, now() FROM generate_series(1, $2) AS g`,
      [s.id, cap],
    );
    const { last } = await fight(s);
    expect(last.result).toBe('win');
    expect(last.reward).toBeNull();
    expect(last.creatureXp).toBeDefined();
  });
});
