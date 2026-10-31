# Known limitations

Stated openly so nobody relies on something that is not there.

## Platform

- **Web-only anti-cheat is weak.** A browser PWA cannot detect mock-location apps, cannot use platform
  integrity attestation and gets no background location on iOS. Consequence: real-value token claims
  stay disabled while the client is web-only (master prompt §16). Testnet and simulated rewards are fine.
- **iOS PWA limits.** No background geolocation, limited push notifications, storage can be evicted.

## NEAR (Phase 3, wallet link)

- **Not yet tried with a real wallet.** The signature check is tested with keys generated in the
  tests and against signatures made by NEAR's own library (near-api-js 7.4); the wallet picker
  opens in the browser. Signing with Meteor, Intear or another wallet, and the RPC check against
  testnet, could not be run here (no access to NEAR from this environment) and need a manual try.
- Testnet only: `NEAR_NETWORK=mainnet` refuses to start. Linking a wallet unlocks nothing yet;
  no tokens, NFTs or claims exist.
- Only ed25519 keys are accepted (secp256k1 keys are rare on NEAR).
- The game keeps no wallet session: the connector is closed after signing, so the player picks a
  wallet again every time they link.
- **Creature NFTs are not deployed.** The contract is written and unit-tested (6 tests) and the API
  is tested against an in-memory contract, but the `.wasm` has not been built here (it builds in
  CI) nor deployed to testnet, and no real mint has happened. Steps in `contracts/creatures/README.md`.
- Ownership is read from the chain when a collection opens (at most every 30 s per player) and
  every 10 minutes: a sold creature can stay visible to its seller for a few minutes.
- A creature never comes back from being an NFT (there is no burn or "return to game"); it stays
  playable in the game for whoever holds the token.
- Minting is free for the player; the game pays storage (~0.01 NEAR per token, 0.1 attached and the
  rest refunded). There is no daily mint limit per player yet.
- The token's metadata is fixed at mint: a creature that levels up later still shows its level
  when it left.
- NFT card text uses Fredoka only if the server has it installed; otherwise DejaVu Sans or another
  system sans-serif (the examples in `docs/nft/` were drawn with the fallback).
- Cards are drawn by the API on first request and kept in memory (200 at most); nothing is pinned
  to permanent storage (IPFS/Arweave): if the API's address changes, existing tokens point to the
  old one. Choose the final `PUBLIC_API_URL` before minting for real.
- The supply numbers are a design choice, not yet checked against the economy simulation (how
  fast a species would sell out with N players).

## Current state (Phase 1 complete, milestone 9)

- The Phase 1 game loop works end to end: accounts, map, places with rewards, wild spawns,
  encounters, captures, battles, collection, evolution, shop, crafting, daily missions, the Dex,
  a first-game guide, an admin panel for review cases and reported places, and offline reading.
- **Not yet tried on a real phone.** Everything was verified in headless Chromium at 390 px;
  touch, real GPS, battery, iOS Safari quirks and the install prompt are untested.
- Offline covers reading (Dex, collection, portraits, profile) once the app has been opened
  online at least once after install; playing needs the server. Only the production build has
  the service worker (`pnpm build` + `vite preview`), not `pnpm dev`.
- Battle sprites are the painted portrait deformed as a puppet (stretch, squash, sway), not new
  drawn poses: legs and wings do not move on their own, and the creature keeps the direction it
  was painted facing. Real poses need frames from the artist; the sheet layout and CSS already
  take them (6 idle, 5 attack frames of 224 x 256).
- Cut-outs are automatic (BiRefNet-lite): fine detail such as thin wings, flags or fur edges can
  lose bits or keep a halo of the painted background; masks in `art/masks/` can be fixed by hand
  and the sheets rebuilt.
- The admin panel has no pagination or search and lists at most 50 cases and 200 places.
- Accessibility was checked with axe on every screen (no violations) plus keyboard focus on tab
  changes; a review with a screen reader on a phone is still to do.
- The economy numbers are tuned by a simulation (config v2, docs/economy), not by real players.
  The simulated players follow a simple sensible policy and the city is modelled as ~10 reachable
  creatures and ~6 places per walking hour; real behaviour and the real Córdoba data will differ.
  Re-run the simulation after the OpenStreetMap import and after the first play test.
- The game config lives in code (`DEFAULT_CONFIG`); it is not yet written to `config_versions`
  in the database, so a running server cannot switch config versions without a deploy.
- A regular player catches about three quarters of the 44 wild creatures in the first month:
  the Dex needs more species (or regional ones) to stay a long-term goal.
- The first-cell exploration reward (`rewards.newCell`) is configured but not implemented.
- A 5-minute cooldown per place means a player standing between two places can collect every few
  minutes; the daily Gold cap is the only limit on that today.
- Missions reset at midnight Europe/Madrid for everyone, wherever they play.
- Battles are 1v1 with one creature each and no switching; no trainer (NPC) battles and no PvP.
- Damage numbers (damage scale, type weight) come from a quick simulation in the tests; the
  economy simulation uses the battle engine as it is and tunes only rewards, XP and spawns.
- Spawn slots per biome and flee chances are still the Phase 1 assumptions; the simulation checked
  them only indirectly (through the targets).
- The throw's timing score is reported by the client. A modified client can always send 1; the
  effect is capped at +25 % of the chance (decision S7).
- "Seen" is recorded when an encounter opens, so the Dex stays hidden until a player walks to a
  creature. Creatures shown on the map but never approached stay "???".
- Portraits in the map markers and lists are loaded one file per creature; no sprite sheet yet.
- Skills and passives are defined (power, accuracy, effect and value) but nothing applies them until
  the combat engine in milestone 7.
- Creature portraits are painted bitmaps (WebP): one pose each, no animations or shiny variants.
  The 100 files weigh about 3 MB; the Dex loads thumbnails lazily and the full portrait only on a
  creature's page.
- The painted Gas creatures are purple while the Gas element is yellow in the interface. A few
  portraits show text ("24 WORDS TO VERIFY", "BRIDGE FEE") that is not translated, and coin
  symbols that resemble a real currency's.
- The art pipeline (`tools/slice-art.py`) is a Python script with Pillow, outside the pnpm
  toolchain; it only needs running when the sheets change.
- Retention runs hourly once the API starts with `JOBS_ENABLED=true` (the default). If the API is
  down for long, the next run catches up; there is no separate alert yet if jobs stop running.
- Movement checks are heuristics. A spoofer moving at walking pace passes them; they only catch jumps,
  clock tampering and some mock-location apps. This is why real-value rewards stay off (see Platform).
- Honest players can hit a 5-minute pause after leaving a tunnel or getting off a fast train.
- The dev GPS simulator reports a constant 5 m accuracy, so dev accounts collect `constant_accuracy`
  signals. Expected; they never restrict anything.
- Review cases open automatically, but the admin screen to work them arrives with the dashboard.
- **Real Córdoba data has not been imported from this build environment**, which cannot reach
  Overpass. The importer is tested against a synthetic sample in Overpass format; the first real run
  (`world:import`) should be followed by a manual look at the exclusion zones.
- The seed (`world:seed`) uses hand-entered, approximate coordinates and is for development only.
- Basemap glyphs and sprites default to Protomaps' GitHub Pages; self-host them before launch
  (`VITE_MAP_ASSETS_URL`). Without a PMTiles file no external request is made.
- Map rendering was verified in headless Chromium (SwiftShader WebGL), not yet on a physical phone.
- Exclusion rules are tag-based: unmapped schools or homes are not excluded. Player reports and
  admin hiding are the safety net.
- **No real email.** Sign-in links are printed to the API log (`MAIL_DRIVER=log`). The API refuses to
  start with `NODE_ENV=production` until an email provider is integrated.
- **Same-site deployment required.** The session cookie is SameSite=Lax, so the API and the web app
  must share a registrable domain in production (e.g. `api.example.com` and `app.example.com`).
- Signing in to an existing account from a guest session replaces the guest session; that guest's
  progress is not merged. Merging can be added once there is progress worth merging.
- Display names are checked for length and characters only; there is no profanity filter or
  impersonation check yet.
- Expired sessions and used magic links are not yet purged; a cleanup job comes with the job queue
  in milestone 4.
- The Docker image (`infra/db`) and the GitHub Actions workflow were written but **not executed**
  in the build environment (no Docker daemon there). The same schema and tests were verified against
  PostgreSQL 16.15 + PostGIS 3.4.2 + h3-pg 4.1.3 installed directly. First CI run will confirm the
  PostgreSQL 17 image.
- Secret scanning uses `gitleaks-action`, which needs a free license key for GitHub organizations
  (not for personal accounts).

## Android app and device checks

- The Android app (`apps/mobile`) builds in CI but has not been run on a phone by us yet; the
  owner's first install is its first real test.
- Play Integrity is implemented against Google's documented API but untested end to end: it needs
  the owner's Play Console app, a linked Google Cloud project and a service account
  (`docs/ANDROID.md`). Until then device checks are off and `REWARDS_REQUIRE_ATTESTATION` stays
  false.
- Mock-location detection only sees what Android reports; rooted devices can hide it. Play
  Integrity's device verdict is the second line; neither is proof, so failures add risk for a
  person to review rather than banning.
- iOS (App Attest) is not started.
- One API test fails intermittently in CI and passes on rerun; not yet tracked down.

## Friends, trades and events

- Events are created by hand in the admin panel; there are no recurring or automatic events.
- Trade proximity trusts each player's reported location, guarded by the same anti-cheat signals
  as the rest of the game. Neither trades nor friends have been tried by two people on real phones yet.
- The app refreshes friends and offers every 8 seconds while the tab is open; there are no push
  notifications.

## The town (hub)

- The plaza, gym, arena, market and houses exist. Every house is the same cottage; furniture is
  decoration only (nobody bumps into it) and is placed where the player stands, not dragged.
- The market sells whole lots only (no partial buys, no bids) and lists the 60 cheapest offers;
  there is no search yet. Prices are free, so expect odd ones until there are many sellers.
- Arena battles are against another player's defender (an asynchronous ladder), not live
  between two connected players. With few players, ranked battles often find nobody in range
  ("no opponent"); practice then falls back to the host. No seasons or rating decay yet.
- The gym's and arena's numbers (XP, limits, tiers, Elo K) are first guesses in config, not tuned
  with real players.
- Tournaments are played by the server at a fixed time (Saturday 18:00 UTC) without anyone
  watching live; players see the bracket afterwards. With fewer than 4 entrants it is cancelled.
- Seasons follow the UTC calendar month; season rewards are only the record and the achievement.
- Live rooms run on one server instance: a few hundred players at once; more instances need a
  shared bus (Phase 5). A server restart drops connections; clients reconnect on their own.
- The chat filter is a first line (word list, link and contact patterns); real safety relies on
  age-group rooms, blocks, reports and moderators. It has not been tried by real players yet.
- The town's art comes from two owner-supplied sheets that were not drawn for slicing: the plaza
  and portal are faded into the ground to hide their edges, and interiors are drawn at 2× from small pictures, so they look
  soft on large screens.

## Data

- OpenStreetMap coverage and tagging vary by street; exclusion zones for Córdoba will need manual review.
- The nyrGo! logo and the creature art are the owner's; their rights still need confirming before
  launch. App icons are generated from the logo and are busy at small sizes; a simplified mark
  would read better on a home screen.
