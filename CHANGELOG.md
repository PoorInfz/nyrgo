# Changelog

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
