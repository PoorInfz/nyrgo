import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CREATURES_BY_ID, DEFAULT_CONFIG, RECIPES, creatureXpForLevel } from '@nyrgo/shared';
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
const north = (p: { lat: number; lng: number }, m: number) => ({
  lat: p.lat + m / 111_195,
  lng: p.lng,
});
const key = () => `k-${randomUUID()}`;

describe.skipIf(!TEST_DB_URL)('economy', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await makeTestApp();
    await syncContent(t.db);
  });
  afterAll(() => t.close());

  async function player() {
    const g = await createGuest(t.app);
    const at = somewhere();
    const id = g.profile.id as string;
    const call = (
      method: 'GET' | 'POST' | 'DELETE',
      url: string,
      payload?: unknown,
      headers = {},
    ) =>
      injectAs(t.app, {
        method,
        url,
        payload: payload as object,
        headers: { ...cookieHeader(g.token), ...headers },
      });
    const fix = (p: { lat: number; lng: number }) =>
      call('POST', '/v1/world/nearby', { ...p, accuracy: 8 });
    const setGold = (gold: number) =>
      t.db.query(`UPDATE players SET gold = $2 WHERE user_id = $1`, [id, gold]);
    const qty = async (item: string) =>
      (
        await t.db.query<{ qty: number }>(
          `SELECT qty FROM inventory WHERE user_id = $1 AND item_id = $2`,
          [id, item],
        )
      ).rows[0]?.qty ?? 0;
    return { id, at, call, fix, setGold, qty };
  }

  async function placePoi(p: { lat: number; lng: number }) {
    const { rows } = await t.db.query<{ id: string }>(
      `INSERT INTO pois (kind, name, geom, h3_r9, source, biome)
       VALUES ('fountain', 'Fuente de prueba', ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
               h3_lat_lng_to_cell(ST_SetSRID(ST_MakePoint($2, $1), 4326), 9), 'seed', 'urban')
       RETURNING id`,
      [p.lat, p.lng],
    );
    return rows[0]!.id;
  }

  describe('visiting places', () => {
    it('gives Gold, XP and items within 40 m, once per cooldown', async () => {
      const p = await player();
      const poi = await placePoi(north(p.at, 25));
      await p.fix(north(p.at, -60));
      const far = await p.call('POST', `/v1/pois/${poi}/visit`);
      expect(far.json().code).toBe('too_far');

      await t.db.query(
        `UPDATE location_samples SET created_at = created_at - interval '30 seconds' WHERE user_id = $1`,
        [p.id],
      );
      await p.fix(p.at);
      const res = await p.call('POST', `/v1/pois/${poi}/visit`);
      expect(res.statusCode).toBe(200);
      const body = res.json();
      const r = DEFAULT_CONFIG.economy.rewards.poiInteract;
      expect(body.reward.xp).toBe(r.xp);
      expect(body.reward.gold).toBeGreaterThanOrEqual(r.goldMin);
      const got = Object.values(body.items as Record<string, number>).reduce((a, b) => a + b, 0);
      expect(got).toBeGreaterThanOrEqual(r.itemsMin);
      const ledger = await t.db.query(`SELECT reason FROM gold_ledger WHERE user_id = $1`, [p.id]);
      expect(ledger.rows.map((x) => x.reason)).toContain('poi_visit');

      const again = await p.call('POST', `/v1/pois/${poi}/visit`);
      expect(again.statusCode).toBe(429);
      expect(again.json().code).toBe('cooldown_active');

      await t.db.query(
        `UPDATE poi_visits SET last_visit_at = now() - make_interval(mins => $2) WHERE user_id = $1`,
        [p.id, DEFAULT_CONFIG.world.poiCooldownMin],
      );
      expect((await p.call('POST', `/v1/pois/${poi}/visit`)).statusCode).toBe(200);
    });

    it('does not reward hidden places', async () => {
      const p = await player();
      const poi = await placePoi(p.at);
      await t.db.query(`UPDATE pois SET hidden = true WHERE id = $1`, [poi]);
      await p.fix(p.at);
      expect((await p.call('POST', `/v1/pois/${poi}/visit`)).statusCode).toBe(404);
    });
  });

  describe('daily missions', () => {
    it('lists three missions, counts visits and pays a claimed mission once', async () => {
      const p = await player();
      const list = (await p.call('GET', '/v1/me/missions')).json();
      expect(list.missions).toHaveLength(3);
      for (const m of list.missions)
        expect(m).toMatchObject({ progress: 0, completed: false, rewarded: false });

      const poi = await placePoi(p.at);
      await p.fix(p.at);
      const visit = await p.call('POST', `/v1/pois/${poi}/visit`);
      expect(visit.statusCode, visit.body).toBe(200);
      const after = (await p.call('GET', '/v1/me/missions')).json();
      for (const m of after.missions) expect(m.progress, m.id).toBe(m.kind === 'visit' ? 1 : 0);

      const target = after.missions[0];
      const early = await p.call('POST', `/v1/me/missions/${target.id}/claim`);
      expect(early.json().code).toBe('not_ready');

      await t.db.query(
        `INSERT INTO mission_progress (user_id, mission_id, period_start, progress, completed_at)
         VALUES ($1, $2, $3::date, $4, now())
         ON CONFLICT (user_id, mission_id, period_start) DO UPDATE SET progress = $4, completed_at = now()`,
        [p.id, target.id, list.day, target.target],
      );
      const claim = await p.call('POST', `/v1/me/missions/${target.id}/claim`);
      expect(claim.statusCode).toBe(200);
      expect(claim.json().reward.xp).toBe(DEFAULT_CONFIG.economy.rewards.dailyMission.xp);
      expect(claim.json().missions.find((m: { id: string }) => m.id === target.id).rewarded).toBe(
        true,
      );
      const twice = await p.call('POST', `/v1/me/missions/${target.id}/claim`);
      expect(twice.statusCode).toBe(409);
      const other = await p.call('POST', `/v1/me/missions/not-a-mission/claim`);
      expect(other.statusCode).toBe(404);
    });
  });

  describe('shop and crafting', () => {
    it('sells items for Gold through the ledger, once per Idempotency-Key', async () => {
      const p = await player();
      const shop = (await p.call('GET', '/v1/shop')).json();
      expect(shop.items).toContainEqual({ id: 'vault-basic', price: 20, kind: 'capture' });
      expect(shop.items.map((i: { id: string }) => i.id)).not.toContain('hash-shard');

      const poor = await p.call(
        'POST',
        '/v1/shop/buy',
        { item: 'vault-basic', qty: 1 },
        { 'idempotency-key': key() },
      );
      expect(poor.json().code).toBe('insufficient_gold');

      await p.setGold(100);
      const k = key();
      const buy = await p.call(
        'POST',
        '/v1/shop/buy',
        { item: 'vault-basic', qty: 3 },
        { 'idempotency-key': k },
      );
      expect(buy.statusCode).toBe(200);
      expect(buy.json().gold).toBe(40);
      const replay = await p.call(
        'POST',
        '/v1/shop/buy',
        { item: 'vault-basic', qty: 3 },
        { 'idempotency-key': k },
      );
      expect(replay.json()).toEqual(buy.json());
      expect(await p.qty('vault-basic')).toBe(3);
      const ledger = await t.db.query(`SELECT amount, reason FROM gold_ledger WHERE user_id = $1`, [
        p.id,
      ]);
      expect(ledger.rows).toEqual([{ amount: '-60', reason: 'shop' }]);

      const tooMany = await p.call(
        'POST',
        '/v1/shop/buy',
        { item: 'vault-basic', qty: 21 },
        { 'idempotency-key': key() },
      );
      expect(tooMany.statusCode).toBe(400);
      const notSold = await p.call(
        'POST',
        '/v1/shop/buy',
        { item: 'hash-shard', qty: 1 },
        { 'idempotency-key': key() },
      );
      expect(notSold.statusCode).toBe(400);
    });

    it('crafts from a recipe when unlocked, taking inputs and Gold together', async () => {
      const p = await player();
      const recipe = RECIPES.find((r) => r.id === 'craft-vault-reinforced')!;
      const craft = () =>
        p.call('POST', '/v1/craft', { recipe: recipe.id }, { 'idempotency-key': key() });
      expect((await craft()).json().code).toBe('level_required');

      await t.db.query(`UPDATE players SET level = $2 WHERE user_id = $1`, [
        p.id,
        recipe.unlockLevel,
      ]);
      await p.setGold(recipe.gold);
      await t.db.query(
        `INSERT INTO inventory (user_id, item_id, qty) VALUES ($1, 'vault-basic', 2)
         ON CONFLICT (user_id, item_id) DO UPDATE SET qty = 2`,
        [p.id],
      );
      // missing the shard: nothing is taken
      const missing = await craft();
      expect(missing.json().code).toBe('out_of_items');
      expect(await p.qty('vault-basic')).toBe(2);

      await t.db.query(
        `INSERT INTO inventory (user_id, item_id, qty) VALUES ($1, 'hash-shard', 1)`,
        [p.id],
      );
      const ok = await craft();
      expect(ok.statusCode).toBe(200);
      expect(ok.json().gold).toBe(0);
      expect(await p.qty('vault-basic')).toBe(0);
      expect(await p.qty('hash-shard')).toBe(0);
      expect(await p.qty('vault-reinforced')).toBe(1);
    });
  });

  describe('evolution', () => {
    async function withStarter(id: string) {
      const p = await player();
      const c = (await p.call('POST', '/v1/me/starter', { creatureId: id })).json();
      return { p, c };
    }

    it('evolves at the right level for Gold and materials, keeping the same creature', async () => {
      const { p, c } = await withStarter('gwisp');
      const evo = CREATURES_BY_ID.get('gwisp')!.evolution!;
      const evolve = () => p.call('POST', `/v1/me/creatures/${c.id}/evolve`);
      expect((await evolve()).json()).toMatchObject({
        code: 'not_ready',
        detail: 'Needs level 16',
      });

      await t.db.query(
        `UPDATE creature_instances SET level = 16, xp = $2, hp_current = 999 WHERE id = $1`,
        [c.id, creatureXpForLevel(16)],
      );
      expect((await evolve()).json().code).toBe('out_of_items');
      const [material, amount] = Object.entries(evo.materials)[0]!;
      await t.db.query(`INSERT INTO inventory (user_id, item_id, qty) VALUES ($1, $2, $3)`, [
        p.id,
        material,
        amount,
      ]);
      expect((await evolve()).json().code).toBe('insufficient_gold');
      // the failed attempt gave the materials back (one transaction)
      expect(await p.qty(material)).toBe(amount);

      await p.setGold(evo.gold);
      const res = await evolve();
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({
        from: 'gwisp',
        gold: 0,
        creature: { id: c.id, creatureId: 'gasguzzle', level: 16 },
      });
      expect(res.json().creature.hp).toBe(res.json().creature.maxHp);
      const dex = (await p.call('GET', '/v1/me/dex')).json();
      expect(dex.entries.map((e: { creatureId: string }) => e.creatureId).sort()).toEqual([
        'gasguzzle',
        'gwisp',
      ]);
      const ledger = await t.db.query(`SELECT amount, reason FROM gold_ledger WHERE user_id = $1`, [
        p.id,
      ]);
      expect(ledger.rows).toContainEqual({ amount: String(-evo.gold), reason: 'evolution' });
    });

    it('evolves Paperpaw after 30 days in the collection, whatever its level', async () => {
      const p = await player();
      // Paperpaw is not a starter; place one in the collection directly
      const { rows } = await t.db.query<{ id: string }>(
        `INSERT INTO creature_instances (definition_id, owner_id, level, xp, ivs, hp_current, acquired_via, acquired_ref, acquired_at)
         VALUES ('paperpaw', $1, 3, 120, '{"hp":7,"atk":7,"def":7,"spd":7}', 40, 'capture', $2, now() - interval '29 days')
         RETURNING id`,
        [p.id, randomUUID()],
      );
      const id = rows[0]!.id;
      const evolve = () => p.call('POST', `/v1/me/creatures/${id}/evolve`);
      expect((await evolve()).json().detail).toBe('Needs 30 days in your collection');
      await t.db.query(
        `UPDATE creature_instances SET acquired_at = now() - interval '31 days' WHERE id = $1`,
        [id],
      );
      const evo = CREATURES_BY_ID.get('paperpaw')!.evolution!;
      for (const [m, n] of Object.entries(evo.materials)) {
        await t.db.query(`INSERT INTO inventory (user_id, item_id, qty) VALUES ($1, $2, $3)`, [
          p.id,
          m,
          n,
        ]);
      }
      await p.setGold(evo.gold);
      const res = await evolve();
      expect(res.statusCode).toBe(200);
      expect(res.json().creature.creatureId).toBe('diamondpaw');
    });
  });

  it('exports and deletes place visits with the account', async () => {
    const p = await player();
    const poi = await placePoi(p.at);
    await p.fix(p.at);
    const visit = await p.call('POST', `/v1/pois/${poi}/visit`);
    expect(visit.statusCode, visit.body).toBe(200);
    const exp = (await p.call('GET', '/v1/me/data-export')).json();
    expect(exp.placeVisits).toHaveLength(1);
    expect((await p.call('DELETE', '/v1/me', { confirm: 'DELETE' })).statusCode).toBe(204);
    const { rows } = await t.db.query(
      `SELECT count(*)::int AS n FROM poi_visits WHERE user_id = $1`,
      [p.id],
    );
    expect(rows[0].n).toBe(0);
  });
});
