# Environment variables

All are validated at startup (`apps/api/src/config.ts`); the API refuses to start on invalid values.
Production values come from the secret manager, never from committed files.

## API

| Variable              | Required          | Default                   | Notes                                                                                                                                      |
| --------------------- | ----------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `NODE_ENV`            | no                | `development`             | `development`, `test` or `production`                                                                                                      |
| `API_HOST`            | no                | `0.0.0.0`                 | Listen address                                                                                                                             |
| `API_PORT`            | no                | `3000`                    | 1–65535                                                                                                                                    |
| `CORS_ORIGINS`        | no                | `http://localhost:5173`   | Comma-separated allowed origins; state-changing requests from any other `Origin` get 403                                                   |
| `DATABASE_URL`        | yes               | —                         | PostgreSQL connection string; also read by `pnpm db:migrate`                                                                               |
| `ENABLE_DEV_ROUTES`   | no                | `false`                   | Enables `/dev/v1/*` (GPS simulator). Startup fails if set in production                                                                    |
| `APP_URL`             | no                | `http://localhost:5173`   | Web app base URL used in sign-in links. Must be `https://` in production                                                                   |
| `MAIL_DRIVER`         | no                | `log`                     | `log` prints sign-in links to the API log; `memory` keeps them in memory (tests). Both are refused in production                           |
| `DEFAULT_REGION`      | no                | `ES`                      | Two-letter region used when the client sends none; decides the minimum age                                                                 |
| `SESSION_TTL_DAYS`    | no                | `30`                      | Session lifetime, 1–90                                                                                                                     |
| `MAGIC_LINK_TTL_MIN`  | no                | `15`                      | Sign-in link lifetime, 5–60                                                                                                                |
| `REAUTH_WINDOW_MIN`   | no                | `15`                      | How recent a sign-in must be to delete a registered account, 1–60                                                                          |
| `JOBS_ENABLED`        | no                | `true`                    | Run scheduled jobs (retention hourly, risk decay nightly) in this process                                                                  |
| `SPAWN_SECRET`        | yes in production | dev-only value            | Seeds wild spawns (HMAC key). 32+ random characters in production; anyone holding it can predict spawns                                    |
| `NEAR_NETWORK`        | no                | `testnet`                 | NEAR network for wallet links. `mainnet` is refused at start-up until the Phase 6 gates                                                    |
| `NEAR_RPC_URL`        | no                | NEAR's public testnet RPC | Node asked whether a key is a full-access key of an account; https in production                                                           |
| `NEAR_SIGN_RECIPIENT` | no                | `nyrgo`                   | NEP-413 recipient the wallet shows the player; use the app's domain in production                                                          |
| `NEAR_NFT_CONTRACT`   | no                | empty (NFTs off)          | Account of the creatures NFT contract (`contracts/creatures`)                                                                              |
| `NEAR_MINTER_ACCOUNT` | with the contract | empty                     | The game account that owns the contract and mints; pays storage (0.1 NEAR attached per mint, the rest refunded)                            |
| `NEAR_MINTER_KEY`     | with the contract | empty                     | **Secret.** `ed25519:…` full-access key of the minter account; only the API holds it. A key limited to `nft_mint` on the contract is safer |
| `ADMIN_TOKENS`        | no                | empty                     | Admin accounts as `name:role:token` (role `reviewer` or `admin`, token 32+ chars), comma-separated; empty disables `/admin/v1/*`           |

Session cookies get the `Secure` flag automatically when `NODE_ENV=production`.

## World import (scripts)

| Variable       | Default                                   | Notes                                    |
| -------------- | ----------------------------------------- | ---------------------------------------- |
| `OVERPASS_URL` | `https://overpass-api.de/api/interpreter` | Overpass endpoint used by `world:import` |

## Tests

| Variable            | Notes                                                                            |
| ------------------- | -------------------------------------------------------------------------------- |
| `TEST_DATABASE_URL` | Migrated test database. Database tests are skipped when unset; CI always sets it |

## Web (build time)

| Variable              | Default                                       | Notes                                                                                         |
| --------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `VITE_API_URL`        | `http://localhost:3000`                       | Public API base URL. Never put secrets in `VITE_*` variables: they ship in the bundle         |
| `VITE_PMTILES_URL`    | —                                             | PMTiles basemap, e.g. `/tiles/cordoba.pmtiles`. Unset: plain background, no external requests |
| `VITE_MAP_ASSETS_URL` | `https://protomaps.github.io/basemaps-assets` | Glyphs and sprites for the basemap; self-host before launch                                   |
