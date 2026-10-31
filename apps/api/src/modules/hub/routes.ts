import type { FastifyInstance } from 'fastify';
import { Type, type Static } from '@sinclair/typebox';
import {
  DEFAULT_CONFIG,
  canUseWeb3,
  normaliseLook,
  progressBreakdown,
  type AgeBand,
} from '@nyrgo/shared';
import { withTx, type Db } from '../../db.js';
import { HttpProblem } from '../../http/problem.js';
import { requireAuth } from '../auth/sessions.js';
import { loadOwned } from '../creatures/owned.js';
import { checkChat } from './chat.js';
import { Room, type AgeGroup } from './room.js';

/**
 * The hub (the town): one live room per district over a WebSocket, plus REST for what must last
 * (companion, blocks, reports, progress). Nothing in the socket grants XP, Gold or items.
 */

const IdParams = Type.Object({ id: Type.String({ format: 'uuid' }) });
const CompanionBody = Type.Object(
  { creature: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]) },
  { additionalProperties: false },
);
const ReportBody = Type.Object(
  {
    message: Type.Integer({ minimum: 1 }),
    reason: Type.Union(
      ['harassment', 'spam', 'inappropriate', 'personal_info', 'other'].map((r) => Type.Literal(r)),
    ),
  },
  { additionalProperties: false },
);

const MAX_FRAME = 2048;

export interface HubDeps {
  db: Db;
  corsOrigins: string[];
  /** Tests pass their own rooms (manual ticks, fixed clock). */
  rooms?: Map<string, Room>;
}

export async function hubRoutes(app: FastifyInstance, { db, corsOrigins, rooms: given }: HubDeps) {
  const rooms = given ?? new Map([['plaza', new Room('plaza')]]);
  app.addHook('onClose', async () => {
    for (const r of rooms.values()) r.stop();
  });

  /** Everything the hub needs to show a player: who they are there, and the 50 % rule. */
  async function hubProfile(userId: string) {
    const { rows } = await db.query<{
      display_name: string;
      level: number;
      main_xp: string;
      hub_xp: string;
      avatar: unknown;
      age_band: AgeBand;
      companion_id: string | null;
      companion: string | null;
      muted_until: Date | null;
    }>(
      `SELECT p.display_name, p.level, p.main_xp, p.hub_xp, p.avatar, u.age_band, p.companion_id,
              p.chat_muted_until AS muted_until,
              COALESCE(
                (SELECT definition_id FROM creature_instances WHERE id = p.companion_id AND owner_id = p.user_id),
                (SELECT definition_id FROM creature_instances WHERE owner_id = p.user_id
                  ORDER BY (acquired_via = 'starter') DESC, level DESC, acquired_at LIMIT 1)
              ) AS companion
         FROM players p JOIN users u ON u.id = p.user_id
        WHERE p.user_id = $1 AND u.status = 'active'`,
      [userId],
    );
    return rows[0] ?? null;
  }

  app.get('/v1/hub/me', async (req) => {
    const auth = requireAuth(req);
    const p = await hubProfile(auth.userId);
    if (!p) throw new HttpProblem('unauthenticated', 'Sign in required');
    return {
      name: p.display_name,
      ageGroup: canUseWeb3(p.age_band) ? 'adult' : 'minor',
      companion: p.companion,
      companionId: p.companion_id,
      chatMutedUntil: p.muted_until?.toISOString() ?? null,
      progress: progressBreakdown(
        Number(p.main_xp),
        Number(p.hub_xp),
        DEFAULT_CONFIG.hub.maxXpShare,
      ),
    };
  });

  /** Chooses which of the player's own creatures follows them (null = the default). */
  app.put<{ Body: Static<typeof CompanionBody> }>(
    '/v1/hub/companion',
    { schema: { body: CompanionBody } },
    async (req) => {
      const auth = requireAuth(req);
      return withTx(db, async (c) => {
        if (req.body.creature) {
          const mine = await loadOwned(c, auth.userId, req.body.creature);
          if (!mine) throw new HttpProblem('not_found', 'Unknown creature');
        }
        await c.query(`UPDATE players SET companion_id = $2 WHERE user_id = $1`, [
          auth.userId,
          req.body.creature,
        ]);
        return { companionId: req.body.creature };
      });
    },
  );

  app.get('/v1/hub/blocks', async (req) => {
    const auth = requireAuth(req);
    const { rows } = await db.query(
      `SELECT b.blocked_id AS id, p.display_name AS name FROM hub_blocks b
         JOIN players p ON p.user_id = b.blocked_id
        WHERE b.user_id = $1 ORDER BY b.created_at DESC`,
      [auth.userId],
    );
    return { blocked: rows };
  });

  app.post<{ Params: Static<typeof IdParams> }>(
    '/v1/hub/blocks/:id',
    { schema: { params: IdParams }, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (req) => {
      const auth = requireAuth(req);
      if (req.params.id === auth.userId) throw new HttpProblem('validation_failed', 'Not yourself');
      const exists = await db.query(`SELECT 1 FROM users WHERE id = $1`, [req.params.id]);
      if (!exists.rowCount) throw new HttpProblem('not_found', 'Unknown player');
      await db.query(
        `INSERT INTO hub_blocks (user_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [auth.userId, req.params.id],
      );
      for (const r of rooms.values()) r.setMuted(auth.userId, req.params.id, true);
      return { blocked: true };
    },
  );

  app.delete<{ Params: Static<typeof IdParams> }>(
    '/v1/hub/blocks/:id',
    { schema: { params: IdParams } },
    async (req, reply) => {
      const auth = requireAuth(req);
      await db.query(`DELETE FROM hub_blocks WHERE user_id = $1 AND blocked_id = $2`, [
        auth.userId,
        req.params.id,
      ]);
      // still muted if the other player blocked this one
      const theirs = await db.query(
        `SELECT 1 FROM hub_blocks WHERE user_id = $2 AND blocked_id = $1`,
        [auth.userId, req.params.id],
      );
      if (!theirs.rowCount)
        for (const r of rooms.values()) r.setMuted(auth.userId, req.params.id, false);
      return reply.code(204).send();
    },
  );

  /** Reports a chat message; a copy is kept with the report for the moderators. */
  app.post<{ Body: Static<typeof ReportBody> }>(
    '/v1/hub/reports',
    { schema: { body: ReportBody }, config: { rateLimit: { max: 20, timeWindow: '1 hour' } } },
    async (req) => {
      const auth = requireAuth(req);
      const { rows } = await db.query<{ user_id: string; body: string }>(
        `SELECT user_id, body FROM hub_chat WHERE id = $1`,
        [req.body.message],
      );
      const msg = rows[0];
      if (!msg) throw new HttpProblem('not_found', 'Unknown message');
      if (msg.user_id === auth.userId) throw new HttpProblem('validation_failed', 'Not yourself');
      await db.query(
        `INSERT INTO hub_reports (reporter_id, reported_id, message_id, reason, body)
         VALUES ($1, $2, $3, $4, $5) ON CONFLICT (reporter_id, message_id) DO NOTHING`,
        [auth.userId, msg.user_id, req.body.message, req.body.reason, msg.body],
      );
      return { received: true };
    },
  );

  /**
   * The live town. Signed-in players only, from our own origins (a cookie-carrying socket from
   * another site is refused). One message per frame, JSON, small.
   */
  app.get(
    '/v1/hub/ws',
    {
      websocket: true,
      // refused before the upgrade, as plain HTTP errors (the session is already loaded)
      preHandler: async (req) => {
        const origin = req.headers.origin;
        if (origin !== undefined && !corsOrigins.includes(origin)) {
          throw new HttpProblem('bad_origin', 'Origin not allowed');
        }
        requireAuth(req);
      },
    },
    async (socket, req) => {
      if (!req.auth) return socket.close(4001, 'unauthenticated');
      const userId = req.auth.userId;
      const room = rooms.get('plaza')!;
      // messages that arrive while the player is being loaded are dropped
      let ready = false;
      let closed = false;

      socket.on('message', (raw: Buffer) => {
        if (!ready || raw.length > MAX_FRAME) return;
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(raw.toString('utf8')) as Record<string, unknown>;
        } catch {
          return;
        }
        if (msg.t === 'move') {
          room.move(
            userId,
            Number(msg.x),
            Number(msg.y),
            msg.f === 'l' ? 'l' : 'r',
            msg.m === 1 || msg.m === true,
          );
        } else if (msg.t === 'emote' && typeof msg.e === 'string') {
          room.emote(userId, msg.e);
        } else if (msg.t === 'chat' && typeof msg.text === 'string') {
          void chat(msg.text.slice(0, 500));
        }
      });
      socket.on('close', () => {
        closed = true;
        room.leave(userId, socket);
      });

      async function chat(raw: string) {
        const member = room.members.get(userId);
        if (!member) return;
        const { rows } = await db.query<{ muted: boolean }>(
          `SELECT coalesce(chat_muted_until > now(), false) AS muted FROM players WHERE user_id = $1`,
          [userId],
        );
        if (rows[0]?.muted) return room.error(userId, 'chat_muted');
        const checked = checkChat(raw, DEFAULT_CONFIG.hub.chatMaxLength);
        if (!checked.ok) {
          if (checked.reason !== 'empty') room.error(userId, `chat_${checked.reason}`);
          return;
        }
        const allowed = room.allowChat(userId, checked.text);
        if (allowed !== 'ok') return room.error(userId, `chat_${allowed}`);
        const saved = await db.query<{ id: string }>(
          `INSERT INTO hub_chat (user_id, age_group, room, body) VALUES ($1, $2, $3, $4) RETURNING id`,
          [userId, member.ageGroup, room.id, checked.text],
        );
        room.say(userId, saved.rows[0]!.id, checked.text);
      }

      const p = await hubProfile(userId);
      if (!p) {
        socket.close(4001, 'unauthenticated');
        return;
      }
      const blocks = await db.query<{ other: string }>(
        `SELECT blocked_id AS other FROM hub_blocks WHERE user_id = $1
       UNION SELECT user_id FROM hub_blocks WHERE blocked_id = $1`,
        [userId],
      );
      if (closed) return;
      const ageGroup: AgeGroup = canUseWeb3(p.age_band) ? 'adult' : 'minor';
      room.join({
        userId,
        name: p.display_name,
        level: p.level,
        look: normaliseLook(p.avatar),
        companion: p.companion,
        ageGroup,
        muted: new Set(blocks.rows.map((r) => r.other)),
        socket,
      });
      ready = true;
    },
  );
}
