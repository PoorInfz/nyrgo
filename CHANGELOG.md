# Changelog

## 0.4.0 — 2026-10-29 — Phase 1, milestone 4: movement checks and data retention

Added

- Server-side movement checks on every location fix: speed from server time with accuracy margins,
  pause above 30 km/h, 5-minute cooldown after a jump, weak signals for jumps, impossible speeds,
  clock skew and constant accuracy.
- Risk score with a 72-hour half-life, a review case at 70 for a human, and no automatic bans.
- `requireInteractable()` guard for the gameplay actions coming next.
- `/v1/world/nearby` now returns the movement verdict; places are only "in range" when the player
  may interact.
- pg-boss job queue in the API process: hourly retention and nightly risk decay; `jobs:run` CLI.
- Migration `anticheat`: `player_movement`, `review_cases`, `risk_score()`, retention indexes.
- Web: cooldown notice after a jump; driving warning also when the server measured the speed.

Changed

- Account deletion also removes movement state, review cases and POI reports.
- New error code `location_required` (428) when an action needs a recent fix.

Verified locally on 2026-10-29: 125 tests passing (12 shared, 86 API, 27 web); the teleport cooldown and
signal observed in headless Chromium against the real API (2 places in range before the jump,
0 after, notice shown, one 15-point signal stored); jobs scheduled at API start; `jobs:run retention`
executed against PostgreSQL.

## 0.3.0 — 2026-10-29 — Phase 1, milestone 3: map and world data

Added

- OpenStreetMap importer (`world:import`): Overpass query for Córdoba, tag classifier for public
  landmarks and exclusion zones, polygon assembly and corridor buffers in PostGIS, idempotent
  re-imports that remove vanished rows and keep player reports.
- Exclusion zones for schools, childcare, health, police, prisons, military, cemeteries,
  construction, playgrounds, water, motorways, rail and private homes; places of worship never used.
- Development seed (`world:seed`) with 10 approximate landmarks in central Córdoba.
- Migration `world-data`: POI provenance, biome and tags, text OSM refs, `poi_reports`,
  `is_excluded(point, ignore)`.
- `POST /v1/world/nearby` (visible places by distance, in-range flag, OSM attribution; stores the
  location sample) and `POST /v1/pois/:id/report` (three distinct reports hide a place).
- Web: Map and Profile tabs; location permission explained before it is requested; MapLibre map
  with PMTiles basemap support and a no-basemap fallback; accessible list of nearby places;
  weak-signal and driving warnings; report button; GPS simulator for development.

Fixed

- Schema: POIs keyed by OSM type and id together (`n1` and `w1` no longer collide).

Verified locally on 2026-10-29: 99 tests passing (12 shared, 62 API, 25 web); the import and
seed scripts run against PostgreSQL; the game played in headless Chromium against the real API,
both in the dev build (simulator) and the production build (browser geolocation): age gate,
location, nearby list, map render, teleport, weak fix, no console errors, no horizontal overflow,
simulator absent from production bundles.

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
