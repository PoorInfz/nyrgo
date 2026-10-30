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
- `SITE_APP_OPEN=true` turns "Beta en Córdoba · muy pronto" into a "¡Jugar ahora!" link to
  `SITE_APP_URL` (default `https://app.nyrgo.fun`).

## Cloudflare Pages

Workers & Pages → Create → Pages → Connect to Git → `PoorInfz/nyrgo`:

| Setting                | Value                                     |
| ---------------------- | ----------------------------------------- |
| Production branch      | `main`                                    |
| Framework preset       | None                                      |
| Build command          | `pnpm --filter "@nyrgo/site..." build`    |
| Build output directory | `apps/site/dist`                          |
| Root directory         | (empty)                                   |
| Environment variables  | `NODE_VERSION=24`, `PNPM_VERSION=10.28.0` |

Then Custom domains → add `nyrgo.fun` (and `www.nyrgo.fun`); the DNS records are created
automatically when the domain is on the same Cloudflare account. Every push to `main` redeploys.
