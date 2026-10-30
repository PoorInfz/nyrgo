# nyrgo.fun — public website

A static page presenting the game, built from the game's own data (`@nyrgo/shared`) and art
(`apps/web/public`), so it never drifts from the game.

```bash
pnpm --filter "@nyrgo/site..." build     # → apps/site/dist
```

- English at `/` (main), Spanish at `/es/`; the switch in the top bar remembers the choice, and a
  first visit from a Spanish browser goes to `/es/`.
- `page.html` + `i18n.mts` — the page and its text in each language.
- `static/` — styles, script (language, element filter), NFT card examples, Cloudflare `_headers`.
- `build.mts` — renders each language with the creature grid, starters, filters and NFT supplies.
- The "Play now" buttons link to `SITE_APP_URL` (default `https://app.nyrgo.fun`);
  `SITE_APP_OPEN=false` turns them into "Coming soon".

## Cloudflare (Workers, static assets)

Workers & Pages → Create → Import a repository → `PoorInfz/nyrgo`:

| Setting               | Value                                                   |
| --------------------- | ------------------------------------------------------- |
| Project name          | `nyrgo` (must match `name` in `wrangler.jsonc`)         |
| Build command         | `pnpm --filter "@nyrgo/site..." build`                  |
| Deploy command        | `npx wrangler deploy --config apps/site/wrangler.jsonc` |
| Root directory        | `/` (empty)                                             |
| Environment variables | `NODE_VERSION=24`, `PNPM_VERSION=10.28.0`               |

The output folder (`apps/site/dist`) is set in `wrangler.jsonc`. Then Settings → Domains &
Routes → add `nyrgo.fun` and `www.nyrgo.fun` as custom domains. Every push to `main` redeploys.

With Cloudflare Pages instead (the "Looking to deploy Pages?" link on the create screen), the same
build command with output directory `apps/site/dist`.
