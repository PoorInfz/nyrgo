import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { Type, type Static } from '@sinclair/typebox';
import { checkAge } from '@nyrgo/shared';
import type { AppConfig } from '../../config.js';
import { isUniqueViolation, withTx, type Db } from '../../db.js';
import { HttpProblem } from '../../http/problem.js';
import { loadProfile } from '../account/profile.js';
import type { Mailer } from './mailer.js';
import { clearSessionCookie, createSession, revokeSession, setSessionCookie } from './sessions.js';
import { hashToken, looksLikeToken, newToken } from './tokens.js';

const GuestBody = Type.Object(
  {
    birthYear: Type.Integer({ minimum: 1900, maximum: 2100 }),
    birthMonth: Type.Integer({ minimum: 1, maximum: 12 }),
    region: Type.Optional(Type.String({ pattern: '^[A-Za-z]{2}$' })),
  },
  { additionalProperties: false },
);

const MagicLinkBody = Type.Object(
  { email: Type.String({ format: 'email', maxLength: 254 }) },
  { additionalProperties: false },
);

const VerifyBody = Type.Object(
  { token: Type.String({ minLength: 1, maxLength: 128 }) },
  { additionalProperties: false },
);

/** At most this many links per address per window, whoever asks for them. */
const LINKS_PER_EMAIL = 3;
const LINK_WINDOW_MIN = 15;

export interface AuthDeps {
  db: Db;
  config: AppConfig;
  mailer: Mailer;
}

export async function authRoutes(app: FastifyInstance, { db, config, mailer }: AuthDeps) {
  app.post<{ Body: Static<typeof GuestBody> }>(
    '/v1/auth/guest',
    {
      schema: { body: GuestBody },
      config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
    },
    async (req, reply) => {
      if (req.auth) throw new HttpProblem('conflict', 'Already signed in');
      const region = (req.body.region ?? config.defaultRegion).toUpperCase();
      const age = checkAge(req.body.birthYear, req.body.birthMonth, region);
      if (!age.ok) {
        throw new HttpProblem(
          'age_restricted',
          'Too young to create an account',
          `Minimum age in ${region} is ${age.minAge}`,
        );
      }
      const result = await withTx(db, async (c) => {
        const { rows } = await c.query<{ id: string }>(
          `INSERT INTO users (kind, age_band, region) VALUES ('guest', $1, $2) RETURNING id`,
          [age.band, region],
        );
        const userId = rows[0]!.id;
        const name = `Explorer-${randomBytes(3).toString('hex')}`;
        await c.query(`INSERT INTO players (user_id, display_name) VALUES ($1, $2)`, [
          userId,
          name,
        ]);
        const session = await createSession(c, userId, config.sessionTtlDays);
        const profile = await loadProfile(c, userId);
        return { session, profile };
      });
      setSessionCookie(reply, config, result.session.token, result.session.expiresAt);
      return reply.code(201).send(result.profile);
    },
  );

  app.post<{ Body: Static<typeof MagicLinkBody> }>(
    '/v1/auth/magic-link',
    {
      schema: { body: MagicLinkBody },
      config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
    },
    async (req, reply) => {
      const email = req.body.email.trim().toLowerCase();
      // Same answer whatever happens, so the endpoint cannot be used to discover accounts.
      const accepted = () => reply.code(202).send({ sent: true });

      const recent = await db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM magic_links
          WHERE email = $1 AND created_at > now() - make_interval(mins => $2)`,
        [email, LINK_WINDOW_MIN],
      );
      if (recent.rows[0]!.n >= LINKS_PER_EMAIL) return accepted();

      const existing = await db.query<{ id: string }>(
        `SELECT id FROM users WHERE email = $1 AND kind = 'registered' AND status = 'active'`,
        [email],
      );
      let purpose: 'login' | 'upgrade' | null = null;
      let userId: string | null = null;
      if (existing.rows[0]) {
        purpose = 'login';
        userId = existing.rows[0].id;
      } else if (req.auth?.kind === 'guest') {
        purpose = 'upgrade';
        userId = req.auth.userId;
      }

      if (!purpose || !userId) {
        await mailer.send({
          to: email,
          subject: 'nyrgo',
          text:
            'Alguien pidió entrar en nyrgo con este email, pero no hay ninguna cuenta asociada. ' +
            `Para crear una, empieza como invitado en ${config.appUrl} y guarda tu progreso con tu email. ` +
            'Si no fuiste tú, ignora este mensaje.',
        });
        return accepted();
      }

      const token = newToken();
      await db.query(
        `INSERT INTO magic_links (email, purpose, user_id, token_hash, expires_at)
         VALUES ($1, $2, $3, $4, now() + make_interval(mins => $5))`,
        [email, purpose, userId, hashToken(token), config.magicLinkTtlMin],
      );
      const link = `${config.appUrl}/auth/verify?token=${token}`;
      await mailer.send({
        to: email,
        subject:
          purpose === 'login' ? 'Tu enlace para entrar en nyrgo' : 'Guarda tu progreso en nyrgo',
        text:
          `Abre este enlace en los próximos ${config.magicLinkTtlMin} minutos: ${link}\n` +
          'Si no lo pediste tú, ignora este mensaje.',
        link,
      });
      return accepted();
    },
  );

  app.post<{ Body: Static<typeof VerifyBody> }>(
    '/v1/auth/verify',
    {
      schema: { body: VerifyBody },
      config: { rateLimit: { max: 20, timeWindow: '15 minutes' } },
    },
    async (req, reply) => {
      const { token } = req.body;
      if (!looksLikeToken(token)) throw new HttpProblem('invalid_token', 'Invalid or expired link');
      const current = req.auth;

      const result = await withTx(db, async (c) => {
        const { rows } = await c.query<{
          purpose: 'login' | 'upgrade';
          user_id: string;
          email: string;
        }>(
          `UPDATE magic_links SET used_at = now()
            WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
          RETURNING purpose, user_id, email`,
          [hashToken(token)],
        );
        const link = rows[0];
        if (!link) throw new HttpProblem('invalid_token', 'Invalid or expired link');

        if (link.purpose === 'upgrade') {
          try {
            const up = await c.query(
              `UPDATE users SET kind = 'registered', email = $2, updated_at = now()
                WHERE id = $1 AND kind = 'guest' AND status = 'active'`,
              [link.user_id, link.email],
            );
            if (up.rowCount === 0) {
              throw new HttpProblem('invalid_token', 'Invalid or expired link');
            }
          } catch (err) {
            if (isUniqueViolation(err)) {
              throw new HttpProblem('email_taken', 'This email already has an account');
            }
            throw err;
          }
        } else {
          const ok = await c.query(
            `SELECT 1 FROM users WHERE id = $1 AND kind = 'registered' AND status = 'active'`,
            [link.user_id],
          );
          if (ok.rowCount === 0) throw new HttpProblem('invalid_token', 'Invalid or expired link');
        }

        // Rotate: the session in use (if any) is replaced by a fresh one.
        if (current) await revokeSession(c, current.sessionId);
        const session = await createSession(c, link.user_id, config.sessionTtlDays);
        const profile = await loadProfile(c, link.user_id);
        return { session, profile };
      });

      setSessionCookie(reply, config, result.session.token, result.session.expiresAt);
      return reply.send(result.profile);
    },
  );

  app.post('/v1/auth/logout', async (req, reply) => {
    if (req.auth) await revokeSession(db, req.auth.sessionId);
    clearSessionCookie(reply, config);
    return reply.code(204).send();
  });
}
