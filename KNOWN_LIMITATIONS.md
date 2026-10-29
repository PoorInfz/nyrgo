# Known limitations

Stated openly so nobody relies on something that is not there.

## Platform

- **Web-only anti-cheat is weak.** A browser PWA cannot detect mock-location apps, cannot use platform
  integrity attestation and gets no background location on iOS. Consequence: real-value token claims
  stay disabled while the client is web-only (master prompt §16). Testnet and simulated rewards are fine.
- **iOS PWA limits.** No background geolocation, limited push notifications, storage can be evicted.

## Current state (Phase 1, milestone 4)

- Accounts, the map and nearby places work. No creatures, captures, battles or Gold faucets yet
  (milestones 5–8).
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
