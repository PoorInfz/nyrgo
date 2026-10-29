# nyrgo

Mobile-first geolocation creature-collection RPG with an original IP and optional NEAR integration.
The full game is playable without a wallet, crypto or purchases.

Status: **Phase 3 in progress: NEAR accounts can be linked and creatures taken out as NFTs (testnet, contract not deployed yet)**. See [CHANGELOG.md](CHANGELOG.md).

## Layout

| Path                  | What it is                                                                |
| --------------------- | ------------------------------------------------------------------------- |
| `apps/api`            | Fastify API (modular monolith), SQL migrations, integration tests         |
| `apps/web`            | React + Vite PWA client                                                   |
| `packages/shared`     | Domain types, error codes and default game config shared by both          |
| `packages/sim`        | Economy and progression simulation on the shared game rules               |
| `contracts/creatures` | NEP-171 NFT contract for creatures (Rust, near-sdk)                       |
| `infra/db`            | PostgreSQL 17 + PostGIS + h3-pg image for local dev and CI                |
| `.github/workflows`   | CI: format, lint, typecheck, migrations, tests, build, audit, secret scan |

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

Open http://localhost:5173, pass the age gate and you are playing as a guest. To save progress with
an email, request a link: with `MAIL_DRIVER=log` the link appears in the API log (`dev mail (not sent)`);
open it in the same browser.

## World data (Córdoba)

The map needs places and no-go zones. Two ways to get them:

```bash
# Quick start: 10 approximate landmarks in central Córdoba (hand-entered, dev only)
pnpm --filter @nyrgo/api world:seed

# Real data from OpenStreetMap via Overpass (needs internet; takes a minute).
# File paths are relative to apps/api.
pnpm --filter @nyrgo/api world:import --save data/osm/cordoba.json
pnpm --filter @nyrgo/api world:import --file data/osm/cordoba.json   # re-load offline
pnpm --filter @nyrgo/api world:import --dry-run                       # just count
```

The import keeps public landmarks (historic sites, artworks, museums, parks, squares) and builds
exclusion zones where nothing will ever be placed: schools and childcare, hospitals, police,
prisons, military land, cemeteries, construction sites, playgrounds, water, motorways and rail
corridors, and private homes. Places of worship are never game locations. Re-running it updates
changed places, removes deleted ones and keeps player reports. Data © OpenStreetMap contributors (ODbL).

### Basemap (optional)

Without a basemap the map shows a dark background with the game layers on top, which is enough to
play. For streets and labels, extract Córdoba from a Protomaps daily build with the
[pmtiles CLI](https://github.com/protomaps/go-pmtiles/releases):

```bash
pmtiles extract https://build.protomaps.com/<YYYYMMDD>.pmtiles apps/web/public/tiles/cordoba.pmtiles \
  --bbox=-4.85,37.85,-4.72,37.92
echo "VITE_PMTILES_URL=/tiles/cordoba.pmtiles" >> .env
```

### GPS simulator

In development (`pnpm dev`) the game uses a simulator instead of real GPS: teleport to landmarks,
walk preset routes at 5, 15 or 50 km/h, or force a poor 120 m fix. Add `?realgps` to the URL to
use the device GPS. Production builds do not contain the simulator.

## Creature content

The 50 creatures, the type chart, skills, passives, items and recipes live in
`packages/shared/src/content/`. The API copies them into the database on every start (or run
`pnpm --filter @nyrgo/api content:sync`). The creature portraits come from the painted sheets in
`art/sheets/` (five sheets of ten, in Dex order). After replacing a sheet, cut them again:

```bash
pip install pillow
python3 tools/slice-art.py               # writes apps/web/public/creatures/<id>.webp and <id>-thumb.webp
```

A test fails if a creature has no portrait or thumbnail.

## Scheduled jobs

The API runs two jobs on pg-boss (tables in the `pgboss` schema): `retention` every hour (exact
positions erased after 24 h, location history after 30 days, stale sessions and links) and
`risk-decay` nightly. Run one by hand with:

```bash
pnpm --filter @nyrgo/api jobs:run retention
```

Set `JOBS_ENABLED=false` on extra API instances if you prefer a single worker; pg-boss already
runs each schedule only once.

## Tests

```bash
pnpm test                                     # unit tests (database tests are skipped)
createdb -h localhost -U nyrgo nyrgo_test
DATABASE_URL=postgres://nyrgo:nyrgo@localhost:5432/nyrgo_test pnpm db:migrate
TEST_DATABASE_URL=postgres://nyrgo:nyrgo@localhost:5432/nyrgo_test pnpm test
```

## Economy simulation

`packages/sim` plays simulated players through 90 days on the real game rules and checks the
economy against stated targets:

```bash
pnpm --filter @nyrgo/shared build
pnpm --filter @nyrgo/sim sim -- --players 100 --days 90   # ~2 minutes → docs/economy/
```

The report compares config version 1 (Phase 1 assumptions) with the current config.

## Project rules

The master prompt (sections 0–25) governs this repo. Key rules: work phase by phase and stop for
approval at each gate; never claim untested features work; all economy, spawn and anti-cheat values
live in versioned config; no real tokens or mainnet before the Phase 6 gates.

Control files: [DECISIONS.md](DECISIONS.md) · [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md) ·
[THREAT_MODEL.md](THREAT_MODEL.md) · [COMPLIANCE.md](COMPLIANCE.md) · [docs/ENV.md](docs/ENV.md)
