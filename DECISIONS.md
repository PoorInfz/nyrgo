# Decisions

Newest first. Each entry: date, decision, reason, who approved.

## 2026-10-29 — Milestone 2: accounts

| #   | Decision                                                                                                                                     | Reason                                                                                                 |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| A1  | New accounts are only created as guests (age gate there); email is added later by upgrading                                                  | One place for the age check, and the magic-link endpoint never reveals whether an email has an account |
| A2  | Age gate asks birth month and year, stores only the band (`13-15`, `16-17`, `18+`)                                                           | Data minimization; month is enough to never overstate age                                              |
| A3  | Minimum age 14 for Spain, 16 elsewhere (GDPR default), per region                                                                            | LOPDGDD art. 7; to be reviewed per market                                                              |
| A4  | Sessions: 256-bit random token in an httpOnly, SameSite=Lax cookie; only the SHA-256 hash is stored; 30-day expiry; rotated on every sign-in | Stolen database rows cannot be replayed as sessions                                                    |
| A5  | Magic links: single use, 15 minutes, max 3 per address per 15 minutes, plus per-IP limits                                                    | Limits abuse of the email endpoint                                                                     |
| A6  | State-changing requests with a foreign `Origin` are refused                                                                                  | CSRF defence in addition to SameSite cookies                                                           |
| A7  | Unknown request fields are rejected (`removeAdditional: false`), not silently dropped                                                        | Fastify's default would hide client bugs and probing                                                   |
| A8  | Deleting a registered account needs a sign-in from the last 15 minutes                                                                       | Protects against a borrowed unlocked phone                                                             |
| A9  | Mail drivers: `log` (dev, prints the link) and `memory` (tests). The API refuses to start in production until a real provider is added       | Owner has no provider yet; never send sign-in links to logs in production                              |

## 2026-10-29 — Phase 1 architecture (approved by the owner)

| #   | Decision                                                                                          | Reason                                                                                |
| --- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| D1  | Modular monolith, pnpm monorepo (`apps/web`, `apps/api`, `packages/shared`)                       | Lowest operating cost at this stage; modules extract later if justified               |
| D2  | Map tiles: self-hosted Protomaps PMTiles from OSM data                                            | Fixed cost, no player locations sent to a third party (GDPR)                          |
| D3  | Spawns on H3 resolution 9 (~0.11 km² per cell in Córdoba, measured), regions on resolution 7      | Uniform hexagons; native PostgreSQL support through h3-pg                             |
| D4  | Creatures are 3D (GLB); Phase 1 uses code-generated low-poly placeholders, rendered with three.js | Owner choice; placeholders keep gameplay unblocked by art                             |
| D5  | Turn-based 1v1 PvE combat resolved on the server                                                  | Cheaper and harder to cheat than real time                                            |
| D6  | Login: guest + email magic link; OAuth later                                                      | Minimum personal data, no passwords to store                                          |
| D7  | Wallet (Phase 3): `@hot-labs/near-connect` + `near-api-js`                                        | The connector recommended by the official NEAR wallet-login guide, checked 2026-10-29 |
| D8  | Hosting: one EU server with Docker Compose, static frontend behind a CDN                          | EU data residency; provider and domain still to be chosen                             |
| D9  | Repo codename `nyrgo`; pilot city Córdoba, Spain                                                  | Owner choice                                                                          |

## 2026-10-29 — Implementation choices made while scaffolding

| #   | Decision                                                                                              | Reason                                                                                  |
| --- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| I1  | TypeScript pinned to `~6.0.3`, not 7.0                                                                | `typescript-eslint` 8.72 rejects TS 7 (peer range `<6.1.0`). Revisit when it supports 7 |
| I2  | Fastify 5 + TypeBox 0.34 for env and request validation                                               | Same schemas will generate the OpenAPI spec                                             |
| I3  | `node-pg-migrate` 9 with plain `.sql` migrations                                                      | Reviewable SQL, up/down in one file                                                     |
| I4  | PostgreSQL 17 image (`postgis/postgis:17-3.5` + `postgresql-17-h3`) for dev and CI                    | CI builds the same image as local dev, so both run identical extensions                 |
| I5  | Added a `config_versions` table (20 tables, not 19)                                                   | The master prompt requires versioned, auditable config                                  |
| I6  | `gold_ledger` and `admin_audit_log` are append-only via triggers, not only role grants                | Holds even when connected as a superuser                                                |
| I7  | GDPR erasure anonymizes the `users` row instead of deleting it                                        | Append-only ledgers keep only a pseudonymous id; personal fields are nulled             |
| I8  | Only one _successful_ capture per player and spawn (partial unique index); failed attempts may repeat | Lets players retry with another item while blocking duplicate rewards                   |
| I9  | `/health` never touches the database; `/ready` checks the database and spatial extensions             | Liveness must not flap when the database is slow                                        |
| I10 | Dev routes (`/dev/v1/*`) refuse to start in production                                                | Prevents the GPS simulator from ever reaching players                                   |

## Still open

- Hosting provider and domain (does not block Phase 1).
- Email provider (Resend, Postmark, SES or other): required before any production deploy.
- Final 3D art style and pipeline (needed before Phase 4).
