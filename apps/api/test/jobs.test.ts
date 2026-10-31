import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PgBoss } from 'pg-boss';
import { createDb, type Db } from '../src/db.js';
import { JOBS, startJobs } from '../src/jobs/queue.js';
import { runRetention } from '../src/jobs/retention.js';
import { TEST_DB_URL } from './helpers.js';

const silentLog = { info: () => undefined, error: () => undefined } as never;

describe.skipIf(!TEST_DB_URL)('scheduled jobs', () => {
  let db: Db;
  let uid: string;

  beforeAll(async () => {
    db = createDb(TEST_DB_URL!);
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO users (kind, age_band) VALUES ('guest', '18+') RETURNING id`,
    );
    uid = rows[0]!.id;
  });
  afterAll(() => db.end());

  const sample = (hoursAgo: number) =>
    db.query<{ id: string }>(
      `INSERT INTO location_samples (user_id, h3_r9, geom, accuracy_m, created_at)
       VALUES ($1, h3_lat_lng_to_cell(ST_SetSRID(ST_MakePoint(-4.78, 37.88), 4326), 9),
               ST_SetSRID(ST_MakePoint(-4.78, 37.88), 4326)::geography, 5,
               now() - make_interval(hours => $2))
       RETURNING id`,
      [uid, hoursAgo],
    );

  describe('retention', () => {
    it('clears exact positions after 24 h and deletes samples after 30 days', async () => {
      const fresh = (await sample(1)).rows[0]!.id;
      const day = (await sample(25)).rows[0]!.id;
      const old = (await sample(31 * 24)).rows[0]!.id;
      const report = await runRetention(db);
      expect(report.preciseLocationsCleared).toBeGreaterThanOrEqual(1);
      expect(report.locationSamplesDeleted).toBeGreaterThanOrEqual(1);

      const { rows } = await db.query<{ id: string; precise: boolean; cell: string }>(
        `SELECT id::text, geom IS NOT NULL AS precise, h3_r9::text AS cell
           FROM location_samples WHERE id = ANY($1::bigint[])`,
        [[fresh, day, old]],
      );
      const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
      expect(byId[fresh]?.precise).toBe(true);
      expect(byId[day]?.precise).toBe(false); // cell kept, point gone
      expect(byId[day]?.cell).toMatch(/^89/);
      expect(byId[old]).toBeUndefined();
    });

    it('purges stale sessions, links, idempotency keys and old risk signals', async () => {
      const hash = () => Buffer.from(randomUUID());
      const s = await db.query<{ id: string }>(
        `INSERT INTO sessions (user_id, token_hash, created_at, expires_at)
         VALUES ($1, $2, now() - interval '40 days', now() - interval '10 days'),
                ($1, $3, now(), now() + interval '30 days') RETURNING id`,
        [uid, hash(), hash()],
      );
      await db.query(
        `INSERT INTO magic_links (email, purpose, user_id, token_hash, created_at, expires_at)
         VALUES ('x@example.test', 'login', $1, $2, now() - interval '3 days', now() - interval '2 days')`,
        [uid, hash()],
      );
      await db.query(
        `INSERT INTO idempotency_keys (user_id, key, endpoint, request_hash, expires_at)
         VALUES ($1, $2, '/x', '\\x00', now() - interval '1 minute')`,
        [uid, `k-${randomUUID()}`],
      );
      await db.query(
        `INSERT INTO risk_signals (user_id, kind, score, created_at)
         VALUES ($1, 'teleport', 15, now() - interval '100 days'), ($1, 'teleport', 15, now())`,
        [uid],
      );

      const r = await runRetention(db);
      expect(r.sessionsDeleted).toBeGreaterThanOrEqual(1);
      expect(r.magicLinksDeleted).toBeGreaterThanOrEqual(1);
      expect(r.idempotencyKeysDeleted).toBeGreaterThanOrEqual(1);
      expect(r.riskSignalsDeleted).toBeGreaterThanOrEqual(1);

      const left = await db.query(`SELECT id FROM sessions WHERE id = ANY($1)`, [
        s.rows.map((x) => x.id),
      ]);
      expect(left.rows).toEqual([{ id: s.rows[1]!.id }]);
      const signals = await db.query(`SELECT 1 FROM risk_signals WHERE user_id = $1`, [uid]);
      expect(signals.rowCount).toBe(1);
    });

    it('is safe to run repeatedly', async () => {
      await runRetention(db);
      const again = await runRetention(db);
      expect(again).toEqual({
        preciseLocationsCleared: 0,
        locationSamplesDeleted: 0,
        sessionsDeleted: 0,
        magicLinksDeleted: 0,
        walletChallengesDeleted: 0,
        idempotencyKeysDeleted: 0,
        riskSignalsDeleted: 0,
        spawnsDeleted: 0,
        spawnGenerationsDeleted: 0,
        battlesDeleted: 0,
        hubChatDeleted: 0,
        listingsExpired: 0,
        seasonRolled: 0,
        captureMarksDeleted: 0,
      });
    });
  });

  describe('queue', () => {
    it('schedules every job on pg-boss', async () => {
      const boss: PgBoss = await startJobs(TEST_DB_URL!, db, silentLog);
      try {
        const schedules = await boss.getSchedules();
        const got = Object.fromEntries(schedules.map((s) => [s.name, s.cron]));
        for (const job of Object.values(JOBS)) expect(got[job.name]).toBe(job.cron);
      } finally {
        await boss.stop({ graceful: false });
      }
    }, 30_000);
  });
});
