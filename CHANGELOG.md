# Changelog

## 0.7.0 — 2026-10-29 — Phase 1, milestone 7: battles

Added

- Combat engine in `@nyrgo/shared`: speed order, accuracy, damage with the type chart and the
  same-element bonus, critical hits, all 18 passive effects, patches, withdrawing, and a wild
  opponent that usually picks its best move. Pure and deterministic; a shared seeded PRNG.
- Battles in the API: `POST /v1/encounters/:id/battle`, `POST /v1/battles/:id/turn` (secret seed
  per battle and turn, `Idempotency-Key`), `GET /v1/battles/:id`; heal outside battle with
  `POST /v1/me/creatures/:id/heal`.
- A win wears the wild creature out (up to ×2 capture chance), gives the creature XP and levels,
  and pays the player within the daily caps; a loss leaves the creature exhausted until it rests.
- Creatures recover 10 % HP every 5 minutes; current and maximum HP in the collection.
- Migration `battles` (battle state and turns, encounter HP, recovery clock, creature XP curve).
- Web: "Battle" from an encounter with a creature picker, battle screen (HP bars, skills with a
  strong/weak hint, patches, withdraw, a readable log), worn-out notice before throwing, HP and
  healing in the collection; Spanish and English.

Changed

- Captured creatures start with the XP of their level; battle damage applies the type chart's
  square root (decision B3).

Fixed during verification

- Vault choices showed the radio button above its label (since milestone 6).

Verified locally on 2026-10-29: 221 tests passing (52 shared, 123 API, 46 web); lint, typecheck,
format and build clean;
migrations down and up again; in headless Chromium against the real API at 390 px: starter
picked, battle won against a wild creature, worn-out creature captured at 95 %, collection
updated, no console errors, no horizontal overflow.

## 0.6.0 — 2026-10-29 — Phase 1, milestone 6: spawns, encounters and captures

Added

- Wild spawns per H3 cell and 15-minute window, generated from a server secret on first sight,
  identical for every player, staggered per cell, weighted by the cell's biome and by rarity, and
  never placed in an exclusion zone. `/v1/world/nearby` now also returns the creatures in sight.
- Encounters (`POST /v1/spawns/:id/encounter`) within 40 m, behind the movement checks.
- Captures (`POST /v1/encounters/:id/capture`) with the three vaults and a timing score; chance and
  roll on the server; `Idempotency-Key` required; flee chance after a failed throw.
- Collection (`GET /v1/me/creatures`), personal Dex (`GET /v1/me/dex`), inventory
  (`GET /v1/me/inventory`) and the starter pick (`POST /v1/me/starter`).
- Starter kit, player levels, XP and Gold rewards through the ledger with the daily cap.
- Migration `capture`: `spawn_generations`, `encounters`, `dex_entries`, starter and cascade rules.
- Retention: spawns 90 days (with encounters and attempts), generation markers 24 hours.
- Web: creatures on the map (portrait markers) and in an accessible list, encounter screen with
  vault choice and a timing ring (static with reduced motion), Collection tab with the starter
  pick, Dex entries hidden as silhouettes until seen and marked when caught; Spanish and English.
- New config `SPAWN_SECRET` (required, 32+ characters, in production).

Fixed during verification

- Two encounter requests at once (a remounted screen) made the second one fail with a duplicate
  key; they now queue on an advisory lock and share one encounter.
- Four tabs wrapped onto two lines at 390 px.

Verified locally on 2026-10-29: 192 tests passing (36 shared, 113 API, 43 web); lint, typecheck,
format and build clean; migrations down and up again; in headless Chromium against the real API
at 390 px: starter picked, a creature caught with the real throw flow, collection and Dex updated,
no console errors, no horizontal overflow.

## 0.5.1 — 2026-10-29 — 2D creature art

Changed

- Creatures are now 2D: 50 original vector portraits (SVG) drawn in code in a monster-collecting
  style (gradients, cel shading, coloured outlines, elemental glow), one design per creature built
  from its name and lore; rarity adds gold sparkles. Replaces the 3D placeholders at the owner's
  request.
- `GET /v1/dex` returns `art: /creatures/<id>.svg` instead of `model`.
- Dex: thumbnail on every card and a large portrait on the creature page.
- New `art:gen` script; tests check that every creature has art, the committed files match the
  drawings, and each SVG is well-formed, self-contained and uses unique ids.

Removed

- three.js, the GLB writer, the 3D viewer, the 50 `.glb` files (about 1.9 MB) and `models:gen`.

Verified locally on 2026-10-29: 160 tests passing (32 shared, 91 API, 37 web); lint, typecheck,
format and build clean; in headless Chromium against the real API, all 50 portraits and 50
thumbnails loaded in the Dex with no console errors and no horizontal overflow at 390 px.

## 0.5.0 — 2026-10-29 — Phase 1, milestone 5: creature content

Added

- The approved universe: 50 original creatures (16 evolution lines, 8 standalones), 10 elements
  with crypto display names, a balanced 2-strong / 2-weak type chart, 40 skills, 26 passives,
  11 items (capture vaults, patches, revive, evolution materials, a lure) and 5 recipes.
- Rules that derive stats, skills, capture difficulty and evolution costs; the 30-day HODL
  evolution (Paperpaw → Diamondpaw).
- Content tests: counts, chain validity, rising stats, existing references, starters, and a
  banned-word guard against real brands, coins, people and owned memes.
- Migration `content` and an idempotent `content:sync` run at API start; `GET /v1/dex` (public,
  ETag-cached).
- Dependency-free GLB writer and 50 generated low-poly placeholder models; three.js turntable
  viewer that respects reduced motion.
- Web: Dex tab with element filter and creature pages (3D model, stats, skills, passive,
  match-ups, evolution links); Spanish and English.

Fixed during verification

- Epic ring and ice crystals dipped below the ground; figures are now rested on y = 0.
- Gwisp was described as a blue flame while Gas is yellow.

Verified locally on 2026-10-29: 159 tests passing (32 shared, 91 API, 36 web); all five migrations
down and up again; every one of the 50 models rendered in headless Chromium from the Dex with no
console errors; creature page checked at 390 px.

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
