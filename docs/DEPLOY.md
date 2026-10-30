# Deploying nyrGo! (testnet beta)

| Part           | Where                                          | Address                   |
| -------------- | ---------------------------------------------- | ------------------------- |
| Website        | Cloudflare Worker `nyrgo` (`apps/site`)        | https://nyrgo.fun         |
| Game app (PWA) | Cloudflare Worker `nyrgo-app` (`apps/web`)     | https://app.nyrgo.fun     |
| API            | Render web service `nyrgo-api` (`render.yaml`) | https://api.nyrgo.fun     |
| Database       | Neon Postgres (PostGIS, h3, citext)            | —                         |
| Email          | Resend, domain `nyrgo.fun`                     | `hola@nyrgo.fun`          |
| NFT contract   | NEAR testnet                                   | `creatures.nyrgo.testnet` |

Secrets (database URL, Resend key, NEAR key) are only typed into the provider's dashboard; none
is in the repository.

## 1. Database (Neon)

1. Create a project (region: Frankfurt, Postgres 17).
2. Copy the **direct** connection string (not the `-pooler` one: the job queue keeps a
   connection open). It ends in `?sslmode=require`.
3. Nothing else: the API creates the extensions and tables on start (migrations).

## 2. Email (Resend)

1. Add the domain `nyrgo.fun` and create the DNS records it shows (in Cloudflare → DNS; Resend
   can also add them for you with "Sign in to Cloudflare").
2. Wait until the domain shows **Verified**, then create an API key with "Sending access"
   (`re_…`).

## 3. API (Render)

1. New → Blueprint → this repository (reads `render.yaml`).
2. Fill in `DATABASE_URL` (Neon), `RESEND_API_KEY` (Resend) and `NEAR_MINTER_KEY` (the
   `nyrgo.testnet` key, the same as the GitHub secret).
3. When it is live (`/health` answers `{"status":"ok"}`), Settings → Custom Domains → add
   `api.nyrgo.fun`, and create the CNAME it shows in Cloudflare DNS with the proxy **off**
   (grey cloud), so Render can issue the certificate.

## 4. Game app (Cloudflare)

Workers & Pages → Create → Import a repository → `PoorInfz/nyrgo`:

- Project name: `nyrgo-app`
- Build command: `pnpm --filter "@nyrgo/web..." build`
- Deploy command: `npx wrangler deploy --config apps/web/wrangler.jsonc`

Then Settings → Domains & Routes → add `app.nyrgo.fun`. The app talks to
`https://api.nyrgo.fun` (`apps/web/.env.production`).

## 5. The play button

The website's "Play now!" buttons link to the app. To close them again (showing "Coming soon"),
set `SITE_APP_OPEN=false` as a build variable of the `nyrgo` (website) Worker and redeploy.

## Data and checks (GitHub → Actions, run by hand)

- **Import world**: Córdoba's places and exclusion zones from OpenStreetMap into production
  (secret `PROD_DATABASE_URL`).
- **World map upload**: streams the latest Protomaps planet basemap into the R2 bucket
  `nyrgo-tiles` (secrets `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`); the tiles Worker
  (`apps/tiles`, tiles.nyrgo.fun) serves it. Run again to refresh the map.
- **Deploy to Cloudflare**: the app or the website (secrets `CLOUDFLARE_API_TOKEN`,
  `CLOUDFLARE_ACCOUNT_ID`).
- **Production check**: website, app and API answer as expected.
