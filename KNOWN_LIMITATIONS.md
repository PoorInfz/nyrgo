# Known limitations

Stated openly so nobody relies on something that is not there.

## Platform

- **Web-only anti-cheat is weak.** A browser PWA cannot detect mock-location apps, cannot use platform
  integrity attestation and gets no background location on iOS. Consequence: real-value token claims
  stay disabled while the client is web-only (master prompt §16). Testnet and simulated rewards are fine.
- **iOS PWA limits.** No background geolocation, limited push notifications, storage can be evicted.

## Current milestone (Phase 1, milestone 1)

- Only the scaffold exists: health endpoints, schema, CI, a static app shell. No gameplay yet.
- The Docker image (`infra/db`) and the GitHub Actions workflow were written but **not executed**
  in the build environment (no Docker daemon there). The same schema and tests were verified against
  PostgreSQL 16.15 + PostGIS 3.4.2 + h3-pg 4.1.3 installed directly. First CI run will confirm the
  PostgreSQL 17 image.
- Secret scanning uses `gitleaks-action`, which needs a free license key for GitHub organizations
  (not for personal accounts).

## Data

- OpenStreetMap coverage and tagging vary by street; exclusion zones for Córdoba will need manual review.
