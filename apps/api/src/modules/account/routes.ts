import type { FastifyInstance } from 'fastify';
import { Type, type Static } from '@sinclair/typebox';
import type { AppConfig } from '../../config.js';
import { withTx, type Db } from '../../db.js';
import { HttpProblem } from '../../http/problem.js';
import { clearSessionCookie, requireAuth } from '../auth/sessions.js';
import { loadProfile } from './profile.js';

const PatchMeBody = Type.Object(
  { displayName: Type.String({ pattern: '^[\\p{L}\\p{N}_-]{3,24}$' }) },
  { additionalProperties: false },
);

const DeleteMeBody = Type.Object(
  { confirm: Type.Literal('DELETE') },
  { additionalProperties: false },
);

export async function accountRoutes(
  app: FastifyInstance,
  { db, config }: { db: Db; config: AppConfig },
) {
  app.get('/v1/me', async (req) => {
    const auth = requireAuth(req);
    const profile = await loadProfile(db, auth.userId);
    if (!profile) throw new HttpProblem('unauthenticated', 'Sign in required');
    return profile;
  });

  app.patch<{ Body: Static<typeof PatchMeBody> }>(
    '/v1/me',
    { schema: { body: PatchMeBody } },
    async (req) => {
      const auth = requireAuth(req);
      await db.query(
        `UPDATE players SET display_name = $2, updated_at = now() WHERE user_id = $1`,
        [auth.userId, req.body.displayName],
      );
      return loadProfile(db, auth.userId);
    },
  );

  /** GDPR art. 15 and 20: everything we hold about the player, as JSON. */
  app.get(
    '/v1/me/data-export',
    { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } },
    async (req, reply) => {
      const auth = requireAuth(req);
      const id = auth.userId;
      const q = async (sql: string) => (await db.query(sql, [id])).rows;
      const data = {
        exportedAt: new Date().toISOString(),
        account: (
          await q(
            `SELECT id, kind, email, age_band, region, status, created_at FROM users WHERE id = $1`,
          )
        )[0],
        player: (
          await q(`SELECT display_name, level, xp, gold FROM players WHERE user_id = $1`)
        )[0],
        sessions: await q(
          `SELECT created_at, last_seen_at, expires_at, revoked_at FROM sessions WHERE user_id = $1 ORDER BY created_at`,
        ),
        creatures: await q(
          `SELECT id, definition_id, level, xp, acquired_via, acquired_at FROM creature_instances WHERE owner_id = $1`,
        ),
        inventory: await q(`SELECT item_id, qty FROM inventory WHERE user_id = $1`),
        goldLedger: await q(
          `SELECT amount, reason, ref_id, created_at FROM gold_ledger WHERE user_id = $1 ORDER BY id`,
        ),
        missions: await q(`SELECT * FROM mission_progress WHERE user_id = $1`),
        captureAttempts: await q(
          `SELECT spawn_id, item_id, chance, roll, success, created_at FROM capture_attempts WHERE user_id = $1`,
        ),
        battles: await q(`SELECT id, kind, result, created_at FROM battles WHERE user_id = $1`),
        locationSamples: await q(
          `SELECT h3_r9::text AS h3_cell, ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lng,
                  accuracy_m, speed_ms, created_at
             FROM location_samples WHERE user_id = $1 ORDER BY created_at`,
        ),
        riskSignals: await q(`SELECT kind, score, created_at FROM risk_signals WHERE user_id = $1`),
      };
      return reply
        .header('content-disposition', 'attachment; filename="nyrgo-data-export.json"')
        .header('cache-control', 'no-store')
        .send(data);
    },
  );

  /**
   * GDPR art. 17. Personal data is deleted; rows that must stay for ledger integrity
   * (Gold ledger, capture attempts, battles) keep only the now-anonymous user id.
   * Registered accounts must have signed in within the reauth window.
   */
  app.delete<{ Body: Static<typeof DeleteMeBody> }>(
    '/v1/me',
    { schema: { body: DeleteMeBody } },
    async (req, reply) => {
      const auth = requireAuth(req);
      if (auth.kind === 'registered') {
        const ageMs = Date.now() - auth.sessionCreatedAt.getTime();
        if (ageMs > config.reauthWindowMin * 60_000) {
          throw new HttpProblem(
            'reauth_required',
            'Sign in again to delete your account',
            `Use a sign-in link from the last ${config.reauthWindowMin} minutes`,
          );
        }
      }
      await withTx(db, async (c) => {
        const id = auth.userId;
        await c.query(
          `UPDATE users SET status = 'deleted', email = NULL, region = NULL, updated_at = now() WHERE id = $1`,
          [id],
        );
        await c.query(
          `UPDATE players SET display_name = 'deleted', updated_at = now() WHERE user_id = $1`,
          [id],
        );
        for (const sql of [
          `DELETE FROM sessions WHERE user_id = $1`,
          `DELETE FROM magic_links WHERE user_id = $1`,
          `DELETE FROM location_samples WHERE user_id = $1`,
          `DELETE FROM risk_signals WHERE user_id = $1`,
          `DELETE FROM inventory WHERE user_id = $1`,
          `DELETE FROM creature_instances WHERE owner_id = $1`,
          `DELETE FROM mission_progress WHERE user_id = $1`,
          `DELETE FROM idempotency_keys WHERE user_id = $1`,
          `DELETE FROM player_movement WHERE user_id = $1`,
          `DELETE FROM review_cases WHERE user_id = $1`,
          `DELETE FROM poi_reports WHERE user_id = $1`,
        ]) {
          await c.query(sql, [id]);
        }
      });
      clearSessionCookie(reply, config);
      return reply.code(204).send();
    },
  );
}
