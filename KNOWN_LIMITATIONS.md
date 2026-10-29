# Known limitations

Stated openly so nobody relies on something that is not there.

## Platform

- **Web-only anti-cheat is weak.** A browser PWA cannot detect mock-location apps, cannot use platform
  integrity attestation and gets no background location on iOS. Consequence: real-value token claims
  stay disabled while the client is web-only (master prompt §16). Testnet and simulated rewards are fine.
- **iOS PWA limits.** No background geolocation, limited push notifications, storage can be evicted.

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
- The economy numbers (loot, prices, rewards, caps, cooldowns) are the approved starting
  assumptions. The Phase 2 simulation has not checked the faucet/sink balance yet.
- A 5-minute cooldown per place means a player standing between two places can collect every few
  minutes; the daily Gold cap is the only limit on that today.
- Missions reset at midnight Europe/Madrid for everyone, wherever they play.
- Battles are 1v1 with one creature each and no switching; no trainer (NPC) battles and no PvP.
- Battle numbers (damage scale, type weight, XP, rewards) come from a quick simulation in the tests,
  not from the Phase 2 economy simulation.
- Spawn rules (slots per biome, rarity weights, levels, flee chance) are starting assumptions; the
  economy simulation (Phase 2) has not tuned them.
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

## Data

- OpenStreetMap coverage and tagging vary by street; exclusion zones for Córdoba will need manual review.
- The nyrGo! logo and the creature art are the owner's; their rights still need confirming before
  launch. App icons are generated from the logo and are busy at small sizes; a simplified mark
  would read better on a home screen.
