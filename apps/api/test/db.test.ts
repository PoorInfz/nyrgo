/**
 * Integration tests against a real PostgreSQL + PostGIS + h3-pg database that has the
 * migrations applied. Set TEST_DATABASE_URL to run them (CI always does).
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createDb, type Db } from '../src/db.js';

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)('with database', () => {
  let db: Db;
  let app: FastifyInstance;

  beforeAll(async () => {
    db = createDb(url!);
    app = await buildApp({
      config: loadConfig({ DATABASE_URL: url!, NODE_ENV: 'test' }),
      db,
    });
  });

  afterAll(async () => {
    await app.close();
    await db.end();
  });

  it('GET /ready reports the spatial extensions', async () => {
    const res = await app.inject({ method: 'GET', url: '/ready' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ready');
    expect(Object.keys(body.extensions).sort()).toEqual(['h3', 'h3_postgis', 'postgis']);
  });

  it('indexes Córdoba at H3 resolution 9 with ~0.1 km² cells', async () => {
    const { rows } = await db.query<{ km2: number }>(
      `SELECT h3_cell_area(h3_lat_lng_to_cell(point(-4.7794, 37.8882), 9), 'km^2') AS km2`,
    );
    expect(rows[0]!.km2).toBeGreaterThan(0.09);
    expect(rows[0]!.km2).toBeLessThan(0.13);
  });

  describe('schema guarantees', () => {
    let userId: string;

    beforeAll(async () => {
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO users (kind, age_band) VALUES ('guest', '18+') RETURNING id`,
      );
      userId = rows[0]!.id;
    });

    it('keeps the gold ledger append-only and idempotent per (reason, ref_id)', async () => {
      const ref = randomUUID();
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO gold_ledger (user_id, amount, reason, ref_id) VALUES ($1, 10, 'test', $2) RETURNING id`,
        [userId, ref],
      );
      await expect(
        db.query(
          `INSERT INTO gold_ledger (user_id, amount, reason, ref_id) VALUES ($1, 10, 'test', $2)`,
          [userId, ref],
        ),
      ).rejects.toThrow(/duplicate key/);
      await expect(
        db.query(`UPDATE gold_ledger SET amount = 999 WHERE id = $1`, [rows[0]!.id]),
      ).rejects.toThrow(/append-only/);
      await expect(
        db.query(`DELETE FROM gold_ledger WHERE id = $1`, [rows[0]!.id]),
      ).rejects.toThrow(/append-only/);
    });

    it('refuses a negative gold balance', async () => {
      await db.query(`INSERT INTO players (user_id, display_name) VALUES ($1, 'tester')`, [userId]);
      await expect(
        db.query(`UPDATE players SET gold = gold - 1 WHERE user_id = $1`, [userId]),
      ).rejects.toThrow(/check constraint/);
    });

    it('requires an email for registered accounts unless erased', async () => {
      await expect(
        db.query(`INSERT INTO users (kind, age_band) VALUES ('registered', '18+')`),
      ).rejects.toThrow(/check constraint/);
      await expect(
        db.query(
          `INSERT INTO users (kind, age_band, status) VALUES ('registered', '18+', 'deleted')`,
        ),
      ).resolves.toBeDefined();
    });
  });
});
