import type { FastifyInstance } from 'fastify';
import { Type, type Static } from '@sinclair/typebox';
import type { Db } from '../../db.js';
import { HttpProblem } from '../../http/problem.js';
import { requireAuth } from '../auth/sessions.js';

/** Comments a day, per player: plenty for a playtest, not enough to flood the inbox. */
export const FEEDBACK_PER_DAY = 20;

const Body = Type.Object(
  {
    category: Type.Union([
      Type.Literal('bug'),
      Type.Literal('idea'),
      Type.Literal('fun'),
      Type.Literal('other'),
    ]),
    body: Type.String({ minLength: 3, maxLength: 1000 }),
    screen: Type.Optional(Type.String({ maxLength: 40 })),
    build: Type.Optional(Type.String({ maxLength: 40 })),
    lang: Type.Optional(Type.String({ maxLength: 10 })),
  },
  { additionalProperties: false },
);

/** A player's comment from inside the game (a bug, an idea, what was fun). */
export async function feedbackRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.post<{ Body: Static<typeof Body> }>(
    '/v1/feedback',
    { schema: { body: Body }, config: { rateLimit: { max: 10, timeWindow: '1 hour' } } },
    async (req, reply) => {
      const auth = requireAuth(req);
      const text = req.body.body.trim();
      if (text.length < 3) throw new HttpProblem('validation_failed', 'Write a little more');
      const { rows: today } = await db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM feedback
          WHERE user_id = $1 AND created_at > now() - interval '1 day'`,
        [auth.userId],
      );
      if (today[0]!.n >= FEEDBACK_PER_DAY)
        throw new HttpProblem('rate_limited', 'That is enough for today, thank you!');
      const agent = String(req.headers['user-agent'] ?? '').slice(0, 200) || null;
      const { rows } = await db.query<{ id: string }>(
        `INSERT INTO feedback (user_id, category, body, screen, build, agent, lang)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [
          auth.userId,
          req.body.category,
          text,
          req.body.screen ?? null,
          req.body.build ?? null,
          agent,
          req.body.lang ?? null,
        ],
      );
      return reply.code(201).send({ id: Number(rows[0]!.id) });
    },
  );
}
