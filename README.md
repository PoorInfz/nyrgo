# nyrgo

Mobile-first geolocation creature-collection RPG with an original IP and optional NEAR integration.
The full game is playable without a wallet, crypto or purchases.

Status: **Phase 1, milestone 1 (scaffold and CI)**. See [CHANGELOG.md](CHANGELOG.md).

## Layout

| Path                | What it is                                                                |
| ------------------- | ------------------------------------------------------------------------- |
| `apps/api`          | Fastify API (modular monolith), SQL migrations, integration tests         |
| `apps/web`          | React + Vite PWA client                                                   |
| `packages/shared`   | Domain types, error codes and default game config shared by both          |
| `infra/db`          | PostgreSQL 17 + PostGIS + h3-pg image for local dev and CI                |
| `.github/workflows` | CI: format, lint, typecheck, migrations, tests, build, audit, secret scan |

## Requirements

- Node.js 24 LTS (22 also works) and pnpm 10 (`corepack enable`)
- Docker, for the database

## Getting started

```bash
corepack enable
pnpm install
cp .env.example .env
docker compose up -d db          # PostgreSQL + PostGIS + h3 on 127.0.0.1:5432
pnpm --filter @nyrgo/shared build
DATABASE_URL=postgres://nyrgo:nyrgo@localhost:5432/nyrgo pnpm db:migrate
pnpm dev                          # API on :3000, web on :5173
```

Check it: `curl localhost:3000/ready` should report the `postgis`, `h3` and `h3_postgis` versions.

## Tests

```bash
pnpm test                                     # unit tests (database tests are skipped)
createdb -h localhost -U nyrgo nyrgo_test
DATABASE_URL=postgres://nyrgo:nyrgo@localhost:5432/nyrgo_test pnpm db:migrate
TEST_DATABASE_URL=postgres://nyrgo:nyrgo@localhost:5432/nyrgo_test pnpm test
```

## Project rules

The master prompt (sections 0–25) governs this repo. Key rules: work phase by phase and stop for
approval at each gate; never claim untested features work; all economy, spawn and anti-cheat values
live in versioned config; no real tokens or mainnet before the Phase 6 gates.

Control files: [DECISIONS.md](DECISIONS.md) · [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md) ·
[THREAT_MODEL.md](THREAT_MODEL.md) · [COMPLIANCE.md](COMPLIANCE.md) · [docs/ENV.md](docs/ENV.md)
