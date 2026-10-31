# Changelog

## 0.39.0 — 2026-10-31 — Nineteen languages

- The game and the website now come in 19 languages: English, Español, Português, Français,
  Deutsch, Italiano, Nederlands, Polski, Türkçe, Русский, Українська, العربية (right to left),
  हिन्दी, Bahasa Indonesia, 日本語, 한국어, 中文, Tiếng Việt and ไทย. English and Spanish were
  written by hand; the others are machine translations (by Claude) that no native speaker has
  reviewed yet. Creature names, lore, moves and item names stay in English (Spanish on the
  Spanish pages), as before.
- Language picker with flags (flag-icons, MIT) in the app's top corner and in the website's top
  bar. The app loads a language only when it is picked; the website has a page per language
  (`/fr/`, `/ja/`…), and a first visit to `/` goes to the browser's language when we have it.
- The website's top bar links to nyrGo! on X (@nyrGofun); so does the footer.

## 0.38.1 — 2026-10-31 — Leave the globe

- Profile → Your data: "Show my catches on the world map at nyrgo.fun" (adults; on by default).
  Turning it off deletes the marks already kept and they leave the website at once; no new marks
  are kept while it is off. The data export includes the marks.

## 0.38.0 — 2026-10-31 — The website shows the game

- **World globe** at the top of nyrgo.fun: a small pixel-art Earth (Natural Earth land, drawn
  in the browser) that turns with a finger or the mouse, with marks where creatures were caught
  in the last 30 days. Tap a mark (or a chip below) to see the creature and who caught it, masked
  ("E******"). Places are half-degree cells (about 50 km), only adults' catches, shown at least an
  hour later; the API keeps only the cell (`capture_marks`, 90 days) and serves
  `/v1/public/captures` to any site, cached for 5 minutes.
- **Demo section**: the trailer (720p) and a real arena battle recorded from the game, in a phone.

## 0.37.0 — 2026-10-31 — A rebuilt town square

- The square is rebuilt, smaller and fuller: gym, arena and market along the north street; two
  houses on each side along their own lanes, with arches where the lanes leave the street;
  paths from the plaza to the lanes, up to the street and down to the portal; gardens with a
  pond, cherry trees, statues, benches and hedges where there used to be bare grass.
- The planter that blocked the plaza's north gate is gone; the gate now has a path to the street.
- Art fixes: stray bits of neighbouring pieces removed from the sprites (trees, the well and
  others); the plaza and the portal fade into the ground instead of showing a hard edge; the
  plaza's crop no longer includes a strip of the next piece; the grass matches the plaza's.

## 0.36.0 — 2026-10-31 — Leaderboards, bigger explorers

- **Leaderboards** on the profile: level, creatures caught, species caught and the arena's current
  season, top 50 of your age group with avatars, and your own place.
- In town, explorers and their creatures are drawn larger: 1.4× on the square and 2× inside the
  gym, arena and houses, to match the rooms' furniture.
- Fix: a purple strip covered the left of the profile once a player had town XP (the XP bar
  shared a class name with the town screen).

## 0.35.0 — 2026-10-31 — Fights you watch

- **Fight cinematics**: arena battles, gym training and friendly duels now play as a vertical
  film — a VS screen with both creatures' art, "Round 1 — FIGHT!", the two creatures facing
  each other with Street-Fighter-style health bars, every move called out with its name and
  animated with the creature's attack frames, hits with elemental effects, damage numbers,
  critical hits with screen shake, dodges, heals, a K.O. and a result screen with the rewards.
  Sound effects are synthesised in the browser (one-tap mute); ×2 speed and skip. The text
  replay stays below for reference, and any past fight can be watched again from the history.
- Fight results now carry each side's full HP, so health bars are exact (older fights estimate it).
- Players see the fights where their arena defender was challenged.

## 0.34.1 — 2026-10-31 — Always the latest version

- The web app updates itself: a new version is installed as soon as it is published and the page
  reloads into it. It checks when the app comes back to the foreground and every 30 minutes.
  Before, an installed app kept the old version until every window of it was closed.
- The profile shows the build (date and commit), to tell which version is running.

## 0.34.0 — 2026-10-31 — Quests, seasons and tournaments (social hub, phase 5)

- **Notice board**: Ivy gives three daily town quests per player (train, win, greet, visit a
  house, trade, decorate, sign up for the tournament), paying Gold and town XP once each; and
  12 town achievements worked out from what you have done.
- **Arena seasons**: one per calendar month (UTC). At the turn, each record is kept with its final
  place and the rating carries halfway back to 1000. The board shows the current season, your
  place and your past seasons.
- **Weekly tournament**: every Saturday 18:00 UTC, one per age group. Sign up in the arena with a
  creature (4 to 64 players); a seeded knockout bracket is played by the server; 300 / 150 / 75
  Gold for the top four; the last bracket is shown in the arena.
- **Admin**: `/admin/v1/hub/stats` shows who is where in the town right now and the last
  hour's chat, battles, reports, listings and tournament sign-ups.
- Polish: rooms fade in through doors, emotes pop. Fix: the gym/arena/market panels' tabs
  were drawn over the bottom of the screen.

## 0.33.0 — 2026-10-31 — Market and houses (social hub, phase 4)

- **Town market**: Mira, on the square, runs a players' market for game items. Sellers set a
  price for a lot; the items are held until it sells, is withdrawn or lapses (72 h, then they
  come back). Purchases are atomic and idempotent; the game keeps a 5 % fee as a Gold sink. Up
  to 10 open listings each, only within your age group, never with blocked players. Creatures and
  NFTs are not sold here. Market income does not count towards the daily gameplay Gold cap.
- **Houses**: every player has a house, entered from the houses on the square. 33 pieces of
  furniture from the owner's art, sold by Mira; place them where you stand, turn or remove them,
  up to 30 at once. Doors open to nobody, friends (default) or everyone, always within the age
  group and never to blocked players; closing the door shows visitors out at once.
- Fix: town XP that crossed a level could fail to record the level-up Gold (ledger reference).

## 0.32.0 — 2026-10-31 — The gym and the arena (social hub, phase 3)

- **Buildings you walk into**: the gym and the arena now open from their doors on the square,
  drawn with the owner's second art sheet (interiors, ground tiles, new props); the server moves
  players between rooms only when they stand at the door. The square has proper paths now.
- **Gym**: Coach Rook trains your creature against one of his at five difficulties (your level
  −3 to +5). Every bout gives creature XP, wins give more; up to 10 a day.
- **Arena**: ranked battles against another explorer's defender, matched by rating (Elo, K 24;
  the absent defender moves by half) within the same age group, skipping blocked players and at
  most 3 a day against the same opponent; 10 ranked a day. Practice battles count for nothing and
  fall back to the host's creature when nobody is around. Leaderboard, history with replays,
  challenges to your defender, and a choice of defender.
- **Town XP**: training and ranked battles pay town XP, at most 250 a day, still subject to the
  50 % rule: it only counts as far as XP earned outdoors allows.

## 0.31.0 — 2026-10-31 — The town (social hub, phase 2)

- **nyrGo! Town**: a shared 2D town square, entered from the map screen and left through its
  portal, without reloading. Drawn with the owner's art; players see each other in real time,
  walk with arrows/WASD or a touch joystick, wave and cheer, and talk.
- Real-time server over WebSocket on the existing API: session and origin checked before the
  upgrade, moves validated against the map and walking speed, updates only for players in view.
- Chat for everyone within their age group, with links and contact details refused, insults
  masked, rate limits, block, report, and admin moderation (hide, mute, audited); 30-day retention.
- XP is now kept by source; the town can count for at most 50 % of a player's progress
  (`hub.maxXpShare`), enforced where XP is granted. Profile: progress breakdown and the creature
  that follows you in town.
- `docs/HUB.md`: audit, architecture, what was built and what the art needs next.

## 0.30.0 — 2026-10-31 — English first, language switch

- The app starts in English for everyone (it used to follow the browser, Spanish by default).
- Language switch on every screen, over the header banner: a list (English, Español) ready for
  more languages; the choice is remembered on the device and sets the page's `lang`.
- The website's Play buttons pass their language (`?lang=es` from the Spanish page), so players
  arrive in the language they were reading; the app tidies the parameter away.
- Creature names, lore and items fall back to English for any language without its own text.

## 0.29.0 — 2026-10-31 — The app in the website's look

- The app now shares nyrgo.fun's dark theme: night-blue background with violet and cyan glows,
  opaque dark panels with hairline edges, mint → cyan → violet gradient buttons and active tab,
  glass secondary buttons, dark inputs, and toned notices, badges and lists. Map markers keep their
  dark outline on the bright map; encounter and battle scenes keep their painted sky.
- PWA and browser theme colour follow (`#070b1f`).

## 0.28.0 — 2026-10-31 — New website

- nyrgo.fun redesigned: dark, polished theme with gradient accents, two-column hero with stats,
  section kickers, opaque cards, a closing call to action and a sticky bar with a Play button.
- The game's creatures (cut-out sprites) drift slowly behind the page, spread over its whole length;
  fewer on phones, still under reduced motion.
- "Play now!" is on by default (`SITE_APP_OPEN=false` turns it off) and the site says the game is
  available worldwide instead of a Córdoba beta.

## 0.27.1 — 2026-10-30 — Anime explorer

- The explorer redrawn as an anime-style chibi with cel shading: hard-edged violet-leaning shadows
  on every part, big eyes with two-tone irises and sparkle highlights, curved hair locks with an
  "angel ring" shine, brows through the fringe, blush, and a blink every few seconds. Same
  cosmetics, same layering.

## 0.27.0 — 2026-10-30 — Explorer avatar and cosmetics shop

- The player's dot on the map is now their explorer: an original 2D character drawn in layers that
  walks (arms and legs swing, it glides to each new fix and faces the way it goes) and stands still
  when GPS only jitters. Reduced-motion settings stop the animation.
- Wardrobe and cosmetics shop in the profile: skin tone, hairstyle, hair colour, clothes, hat and
  accessory. Free pieces for everyone; the rest bought once with Gold (60–800), idempotent, through
  the Gold ledger. Cosmetics change nothing in play. API: `GET/PUT /v1/me/avatar`,
  `POST /v1/me/cosmetics/buy`; the look and purchases are in the data export.

## 0.26.0 — 2026-10-30 — Friendly duels

- Friendly duels between friends standing together: challenge with one creature, the friend
  answers with one of theirs, and the server fights it out (deterministic `simulateDuel` in the
  shared combat engine, seed kept). Full health, no rewards or losses, 10 a day.
- App: **Duel** button per friend, challenges to answer, results with a turn-by-turn replay.

## 0.25.0 — 2026-10-30 — Events in the admin panel

- Admin panel: **Events** section to find a place by name (nearest to a point first), schedule a
  creature there (level, start, duration) and cancel it, each with a recorded reason.
- `GET /admin/v1/pois/search` (names matched literally, hidden places excluded).

## 0.24.0 — 2026-10-30 — Friends, face-to-face trades and events

- Friends by code, shared in person (200 at most, 20 requests a day, never across the adult and
  minor age groups); friends see name, level and species caught, never a location.
- Face-to-face trades between friends: one creature for one, accepted only while both players'
  latest fixes are under 2 minutes old and within 100 m; 5 a day; NFTs and creatures in battle
  are excluded.
- Events at places: admins schedule a creature at a POI for 15–240 minutes (audited, cancellable);
  everyone there sees it at the event's level. Public `GET /v1/events` lists those within 30 km.
- App: new **Friends** tab (code, requests, friends, trade builder, offers), events card on the map
  screen and highlighted event creatures. See `docs/SOCIAL.md`.

## 0.23.0 — 2026-10-30 — Android app and device checks

- `apps/mobile`: the game as an Android app (Capacitor 8, `fun.nyrgo.app`), built as a debug APK on
  every CI run; manual workflow "Android release" builds the signed bundle for Google Play.
- Native location reports Android's own "mocked" flag: the server pauses interactions for 15
  minutes and records a strong anti-cheat signal (`mock_location`).
- Play Integrity: single-use nonce, token decoded by Google with a service account, verdict
  judged on package, nonce, freshness, app recognition and device integrity; a pass lasts 24 h,
  a failure adds risk. `REWARDS_REQUIRE_ATTESTATION=true` closes NEAR tips and NFT mints to
  verified Android devices. See `docs/ANDROID.md`.

## 0.22.0 — 2026-10-30 — Rewards in NEAR from trading fees

- Creatures contract: the game's own market (`market_list`, `market_unlist`, `market_buy`, 5 %
  fee) and NEP-199 royalties (5 %) on outside resales, both to the treasury
  `rewards.nyrgo.testnet`; the testnet contract was upgraded in place with `migrate`, keeping
  every creature and edition.
- NEAR tips (0.005) for walking to a creature and catching it: one per hour at most, 100 m or more
  from the last tip, 5 a day, adults with a linked wallet; paid by a job from the treasury within a
  daily budget of 3 % of it. See `docs/REWARDS.md`.
- App: market in the collection (buy, sell, take off sale, signed with the player's wallet), tip
  after a catch, tips card in the profile.

## 0.21.0 — 2026-10-30 — NYRGO dropped

- The NYRGO token is gone from the game (contract, API, app card, docs, workflow); its tables are
  dropped by a migration. Rewards will be paid in native NEAR from the game's trading fees (next).
  The testnet contract `token.nyrgo.testnet` stays on chain, unused.

## 0.20.0 — 2026-10-30 — NYRGO token (testnet, play to earn)

- `contracts/token`: NYRGO, a NEP-141 token with a fixed supply of 1,000,000,000 created once in
  the game account (no mint function). Workflow "Deploy token (testnet)".
- Players aged 18+ earn NYRGO for captures, battles won, places visited and missions, at most 50
  per local day and 200,000 per day for the whole game; they claim to their linked NEAR account
  once a day (accounts 7+ days old, low anti-cheat risk, no open review). See `docs/TOKEN.md`.
- The app shows the unclaimed balance and claims it; rewards say "+2 NYRGO".

## 0.19.0 — 2026-10-30 — Play anywhere: the world loads on demand

- `WORLD_ON_DEMAND=true`: the first time someone plays in an area (H3 resolution 6, ~36 km²) the
  API queues it, and a job (every minute) loads its places and exclusion zones from OpenStreetMap,
  trying mirrors and retrying with backoff. Creatures only appear in loaded areas, so they never
  land in a school or a home not yet known; the app says "Exploring this area for the first
  time…" meanwhile. At most 200 areas wait at once.
- The game day (daily gold cap, missions, rewarded wins) follows each player's local time zone,
  looked up offline from where they play (`players.time_zone`).
- `apps/tiles`: a Worker serving the street map for anywhere (tiles.nyrgo.fun) from PMTiles
  archives in R2, cached at the edge; workflow "World map upload" streams the planet basemap
  from Protomaps into R2 part by part (139 GB). The app now draws streets anywhere from it; the
  Córdoba-only tile files are gone.

## 0.18.0 — 2026-10-30 — Live on testnet

- The game runs at app.nyrgo.fun (Cloudflare) with its API at api.nyrgo.fun (Render, Neon).
- Córdoba loaded from OpenStreetMap (490 places, 4,748 exclusion zones).
- Street map: Córdoba's basemap served as the app's own tile files (592 tiles, 5.7 MB), cached
  for weak signal; workflows for tiles, world import, Cloudflare deploys and production checks.

## 0.17.0 — 2026-10-30 — Ready to deploy the game

- Email through Resend (`MAIL_DRIVER=resend`, `RESEND_API_KEY`, `MAIL_FROM`): the API can now
  start in production. Sign-in emails say nyrGo!.
- `apps/api/Dockerfile` (runs migrations, then the server; checked in CI by booting it against an
  empty database), `render.yaml` for Render, `apps/web/wrangler.jsonc` and `.env.production` for
  the app at app.nyrgo.fun, and `docs/DEPLOY.md` with every step.

## 0.16.0 — 2026-10-30 — Website

- `apps/site`: the public page for nyrgo.fun (how to play, the 50 creatures with an element
  filter, NFTs and supplies, FAQ), built from the game's data and art; static, for Cloudflare
  Pages. The play button says "coming soon" until `SITE_APP_OPEN=true`.
- English is the site's main language (`/`), Spanish at `/es/`, with a language switch in the top
  bar.

## 0.15.0 — 2026-10-30 — Testnet deploy of the NFT contract

- Workflow "Fund testnet account" (`pnpm --filter @nyrgo/api testnet:fund`): tops up a testnet
  account through the faucet service near-cli uses, for when the web faucets fail. No secrets.

- `pnpm --filter @nyrgo/api nft:deploy` and the manual workflow "Deploy NFT contract (testnet)":
  create `creatures.<game account>`, deploy and initialise the contract and register every
  species, doing only what is missing (dry run, upgrade). Testnet only; the key comes from the
  `NEAR_TESTNET_GAME_KEY` secret and is never printed. Not yet run against testnet.

## 0.14.1 — 2026-10-29 — NFT cards framed

- Each card's portrait is framed on the creature's real outline (from its cut-out mask, in
  `apps/api/src/modules/nft/focus.ts`, made by `tools/make-focus.py`), so no head or tail is cut
  off. Tall creatures may lose a little ground at the feet; where the painting is too narrow the
  side margins are the same painting, blurred and faded in. All 50 in `docs/nft/all.webp`.

## 0.14.0 — 2026-10-29 — Phase 3, part 3: the NFT collection

Verified locally on 2026-10-29: format, lint, typecheck and build clean; 289 tests passing (67
shared, 160 API, 57 web, 5 simulation) and 11 contract unit tests. Still not deployed: no real
mint has happened.

Added

- Limited supply per species by rarity, fixed on chain: common 1,000, uncommon 400, rare 120,
  epic 30, legendary 10, mythic 3 (22,226 NFTs at most). The contract registers species once,
  numbers every mint ("Gwisp #12/1000") and refuses once a species is sold out.
- Every NFT is one individual: grade D–S from its IVs, and its stats, shown on a card image the
  API draws (`/v1/nft/cards/<token>.png`) and as marketplace attributes
  (`/v1/nft/tokens/<token>.json`).
- Collection: every creature shows its grade; NFTs show their edition and a link to their card.
- Tools: `nft:species` (contract registration arguments), `nft:samples` (example cards in
  `docs/nft/`). Config `PUBLIC_API_URL`, `NFT_ART_DIR`; migration `nft_editions`.

## 0.13.0 — 2026-10-29 — Phase 3, part 2: creatures as NFTs (testnet)

Verified locally on 2026-10-29: format, lint, typecheck and build clean; 284 tests passing (64
shared, 158 API, 57 web, 5 simulation) plus 6 contract unit tests; the NFT
flow is tested against an in-memory contract. The contract `.wasm` is built in CI only and is not
deployed: no real mint has happened yet.

Added

- `contracts/creatures`: NEP-171 NFT contract on near-contract-standards 5.30; only the game account
  mints. CI job builds the `.wasm` with cargo-near.
- Collection → "Take out as NFT" (adults with a linked wallet): the creature is minted to the
  player's NEAR account; badge and holder shown; it cannot evolve while it is an NFT.
- The NFT is the creature: whoever holds the token has it in the game. Ownership is read from the
  chain on opening the collection and every 10 minutes (job `nft-sync`).
- API `GET /v1/nft`, `POST /v1/me/creatures/:id/mint`; config `NEAR_NFT_CONTRACT`,
  `NEAR_MINTER_ACCOUNT`, `NEAR_MINTER_KEY`; migration `creature_nfts`.

## 0.12.1 — 2026-10-29 — Header banner

Changed

- The owner's nyrGo! header banner replaces the logo at the top of the app: whole on the welcome
  screen, a band centred on the logo while playing (`tools/make-logo.py` makes 800 and 1600 px
  WebP versions).

## 0.12.0 — 2026-10-29 — Phase 3, part 1: link a NEAR account (testnet)

Verified locally on 2026-10-29: format, lint, typecheck and build clean; 274 tests passing (64
shared, 150 API, 55 web, 5 simulation), incl. signatures made by near-api-js; the wallet picker opens in the browser for adults and is absent for minors. Not yet tried
with a real wallet or against testnet (no access to NEAR from the build environment).

Added

- Profile → NEAR wallet (adults only, testnet): connect a wallet, sign one message, the account is
  linked. Unlink at any time. No seed phrase, private key or transaction is ever asked for.
- API `GET/DELETE /v1/me/wallet`, `POST /v1/me/wallet/challenge`, `POST /v1/me/wallet/link`:
  NEP-413 signature check, full-access key check through NEAR RPC, one-time challenges.
- Config `NEAR_NETWORK` (testnet only), `NEAR_RPC_URL`, `NEAR_SIGN_RECIPIENT`; migration `wallets`.
- The data export includes the linked account; account deletion removes it.

## 0.11.0 — 2026-10-29 — Phase 2: economy simulation, config version 2

Verified locally on 2026-10-29: format, lint, typecheck and build clean; 257 tests passing (64 shared, 137 API, 51 web, 5 simulation); full simulation of 100 players × 4 archetypes × 90 days in about 2 minutes. Not yet checked with real players.

Added

- `packages/sim`: simulated players (casual, regular, dedicated, intensive) on the game's own rules;
  `pnpm --filter @nyrgo/sim sim` writes `docs/economy/README.md` (targets, before/after, assumptions)
  and the raw numbers.
- Wild creatures meet each player at most 3 levels above the player's own level; the level is kept
  on the encounter and shown that way on the map (migration `encounter_level`).

Changed

- Config version 2 (see docs/economy): less XP and Gold per action, level-up Gold 5 × level,
  fewer free vaults and more evolution materials from places, 3.5 × creature battle XP, slightly
  rarer rare and epic finds, evolved forms rarer in the wild, daily Gold cap 500.
- A regular player now earns about as much Gold as they spend after the first month (0.99, was
  5.1), reaches level 30 in about three months (was three weeks) and evolves a first creature in
  about two weeks (was five).

## 0.10.0 — 2026-10-29 — Game interface and the nyrGo! logo

Verified locally on 2026-10-29: format, lint, typecheck and build clean; 248 tests passing (61 shared, 136 API, 51 web); axe-core reports no violations on 12 screens; screenshots of every screen reviewed at 390 x 844. Not yet tested on a real phone.

Changed

- New look built on the owner's nyrGo! logo (`art/brand/`, cut out by `tools/make-logo.py`):
  mint green with a deep green-black ink outline, painted sky and meadow, purple accent; the
  Fredoka typeface, bundled with the app (no third-party font request).
- Game interface: white windows with an ink outline and hard shadow, chunky buttons that sink
  when pressed, a bottom menu with drawn icons, the logo in the header (large on the welcome
  screen).
- Battle as a game scene: wild creature top right and yours bottom left, each on a glowing ring,
  status boxes facing them, a framed text box with the two newest lines, the four moves in their
  element's colour with strong and weak hints.
- Encounters show the wild creature animated on its ring, with the timing ring over it.
- Dex and collection show the creatures cut out on sky and meadow; creatures not seen yet show
  as silhouettes.
- App name nyrGo!, PNG app icons from the logo, light theme colours.

Fixed

- A battle's result appeared before the last turn had finished playing.

## 0.9.1 — 2026-10-29 — Battle sprites and element effects

Verified locally on 2026-10-29: format, lint, typecheck and build clean; 248 tests passing (61 shared, 136 API, 51 web); in the browser a battle plays idle, attack and element-effect sheets with every sheet served (200). Not yet tested on a real phone.

Added

- Battle sprite sheets for all 50 creatures, cut from the painted portraits: 6 idle frames
  (breathing and sway, looping) and 5 attack frames (crouch, rise, strike, impact, recover).
  The creature is cut out of its painted background (`tools/cut-masks.py`, BiRefNet-lite) and
  deformed like a puppet around its feet (`tools/make-sprites.py`); no new poses are drawn.
- Element effects: one 8-frame sheet per element (splash, flames, leaves, rocks, purple gas and
  sparks, gust, ice shards, crescent and stars, sunburst, dark smoke), drawn by code
  (`tools/make-fx.py`) and played over the fighter a move lands on.
- The service worker caches sprite and effect sheets after the first battle.

Changed

- Battle: fighters stand cut out on a shadow instead of in a portrait card; reduced motion shows
  still frames (the strike frame while attacking) and no effects.

## 0.9.0 — 2026-10-29 — Phase 1, milestone 9: tutorial, admin, offline, accessibility

Verified locally on 2026-10-29: format, lint, typecheck and build clean; 245 tests passing (61 shared, 136 API, 48 web); axe-core reports no violations on 12 screens; production build works offline after the first visit. Not yet tested on a real phone.

Added

- First-game guide on the map screen: five steps ticked from the player's real progress.
- Admin API (`/admin/v1`): review cases with their signals, close with a decision and reason
  (suspend = admin role, signs the player out), restore accounts, reported places (hide or
  restore), audit log; `ADMIN_TOKENS` config. Admin panel at `/admin` in the web app.
- Offline: service worker caches the app shell, creature art, the Dex and the player's profile,
  collection and progress; an offline banner.
- Battle playback: turns are shown event by event with effects on the portraits and HP bars
  that drain step by step; off under reduced motion.
- Accessibility: axe over every screen (no violations), the map as a labelled region, focus
  moves into the panel on tab changes, screen-reader text for done steps.

Changed

- Element colours: Gas purple, Airdrop cyan, Moon indigo (to match the painted art); a test
  keeps all ten apart.

## 0.8.1 — 2026-10-29 — Painted creature art

Changed

- The 50 creatures now use the owner's painted portraits: five sheets kept in `art/sheets/`, cut
  by `tools/slice-art.py` into a 384 px WebP portrait and a 128 px thumbnail each (3 MB in all).
  `GET /v1/dex` returns `art` and `thumb`; lists, markers, battles and the Dex use the thumbnail,
  the creature page and the encounter the portrait. Unseen Dex entries are blurred silhouettes.

Removed

- The code-drawn SVG portraits, their generator and tests.

Verified locally on 2026-10-29: 237 tests passing (60 shared, 131 API, 46 web); lint, typecheck,
format and build clean; in headless Chromium against the real API at 390 px all portraits and
thumbnails loaded through the starter pick, map, encounter, battle and Dex with no console errors
and no horizontal overflow.

## 0.8.0 — 2026-10-29 — Phase 1, milestone 8: economy

Added

- Place visits (`POST /v1/pois/:id/visit`): within 40 m, behind the movement checks, once per
  place every 5 minutes; XP, Gold and 2–4 items rolled on the server.
- Shop (`GET /v1/shop`, `POST /v1/shop/buy`) and workshop (`POST /v1/craft`) with
  `Idempotency-Key`; Gold spent through the append-only ledger.
- Daily missions (`GET /v1/me/missions`, `POST /v1/me/missions/:id/claim`): three per player and
  day, progress from captures, throws, battle wins and place visits.
- Evolution (`POST /v1/me/creatures/:id/evolve`) by level or days held, paying Gold and materials.
- Shared economy rules: place loot table, mission pool and draw, evolution conditions.
- Migration `economy`: place visits, `evolved_from`. Place visits in the data export and erasure.
- Web: "Visit" on places in range with the loot shown, today's missions on the map screen with
  "Claim", Bag tab (items, Gold, shop, workshop), evolve buttons with their cost and conditions
  in the collection; Spanish and English.

Fixed during verification

- Any mission progress on a day whose missions matched the event failed with a server error
  (untyped SQL parameters); found by the visit tests failing on some days only.
- With five tabs, "Colección" broke over two lines and the shop buttons overflowed at 390 px.

Verified locally on 2026-10-29: 241 tests passing (60 shared, 131 API, 50 web); lint, typecheck,
format and build clean; migrations down and up again; in headless Chromium against the real API at
390 px: a place visited (loot shown, mission advanced), a vault bought in the shop, Gwisp evolved
into Gasguzzle, no console errors, no horizontal overflow.

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
