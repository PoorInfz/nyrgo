# Changelog

## 0.2.0 — 2026-10-29 — Phase 1, milestone 2: accounts

Added

- Guest accounts with an age gate (birth month and year; minimum 14 in Spain, 16 elsewhere);
  only the age band is stored.
- Email magic links: upgrade a guest to a registered account, or sign in on another device.
  Single use, 15 minutes, hashed, throttled per address and per IP; no account enumeration.
- Sessions in httpOnly SameSite=Lax cookies, hashed at rest, rotated on sign-in, revoked on logout.
- `GET/PATCH /v1/me`, `GET /v1/me/data-export` (GDPR access/portability) and `DELETE /v1/me`
  (GDPR erasure with anonymized ledger rows; recent sign-in required for registered accounts).
- Foreign-origin refusal on state-changing requests; unknown request fields now rejected.
- Dev mail driver that prints sign-in links to the log; memory driver for tests.
- Migration `magic-links` (new table, `sessions.last_seen_at`).
- Web: age gate, guest start, email sign-in and upgrade, magic-link landing that strips the token
  from the URL, profile with rename, data download, sign-out and deletion; Spanish and English.

Fixed

- `pnpm dev` now loads the repo `.env` file (milestone 1 documented it but never loaded it).

Verified locally on 2026-10-29: 61 tests passing (12 shared, 41 API of which 28 run against
PostgreSQL, 8 web); end-to-end smoke test with curl against the running API (guest → link from
the dev log → registered → `/v1/me`; email absent from logs; foreign origin refused).

## 0.1.0 — 2026-10-29 — Phase 1, milestone 1: scaffold and CI

Added

- pnpm monorepo with `apps/api`, `apps/web` and `packages/shared`; strict TypeScript 6.0.
- API: Fastify 5 with helmet, CORS, rate limiting, problem+json errors, validated env config,
  `/health` and `/ready`, dev routes gated off in production.
- Database: initial migration with 20 tables (accounts, content, world, collection, auditable actions,
  Gold ledger, anti-cheat, idempotency, audit log, config versions); PostGIS and h3-pg.
- Web: React 19 + Vite 8 PWA shell with Spanish and English, safety reminder and API status.
- Shared: domain enums, error codes, default game config v1 and the capture-chance formula.
- Docker image for PostgreSQL 17 + PostGIS + h3; Docker Compose for local development.
- CI: format, lint, typecheck, migrations up/down/up, tests with a real database, build,
  dependency audit, secret scan.
- Control files: DECISIONS, KNOWN_LIMITATIONS, THREAT_MODEL, COMPLIANCE, ENV docs.

Verified locally on 2026-10-29: 26 tests passing (7 shared, 16 API of which 5 run against
PostgreSQL 16.15 + PostGIS 3.4.2 + h3-pg 4.1.3, 3 web); format, lint, typecheck and production
build clean; migration up, down and up again. Not yet run: the Docker image and the GitHub
Actions workflow (see KNOWN_LIMITATIONS.md).
