# Social hub — Phase 1 audit and proposed architecture

Status: **proposal, nothing built yet.** This answers Phase 1 of the hub brief (2026-10-31): what
exists, what the hub can reuse, the smallest compatible architecture, and the conflicts that
need a decision before Phase 2.

## 1. What already exists (and the hub will reuse)

| Area        | Today                                                                                                                                                  | Reuse in the hub                                                                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client      | React 19 + Vite PWA (`apps/web`), MapLibre for the street map, Capacitor Android shell. No 2D game engine.                                             | A new **Hub** screen inside the same app (no page reload, same session).                                                                              |
| Rendering   | DOM/SVG/CSS; creature art as WebP portraits, cut-outs and 6-frame sprite sheets (`public/sprites`); the explorer avatar is layered SVG with cosmetics. | Canvas 2D renderer for the town (no new framework); creature companions from the existing sprite sheets; the player drawn from the same `AvatarLook`. |
| Server      | Fastify 5 (`apps/api`) on Render (`starter`, one instance), Neon Postgres + PostGIS, pg-boss jobs. No WebSockets yet.                                  | Same API process gains one WebSocket endpoint (`@fastify/websocket`); state and rewards stay in Postgres.                                             |
| Identity    | Cookie sessions, guests and registered players, age bands (minimum 14 in Spain, 16 default); web3 only for adults.                                     | The hub uses the session cookie; nothing new to sign in to.                                                                                           |
| Progression | One XP pool on `players` (`xp`, `level`), curve `xpForLevel(L) = 50·L·(L−1)`, level cap 50, `grantReward()` in one place; daily Gold cap.              | Split XP by source inside `grantReward()`; same curve, same cap (see §3).                                                                             |
| Combat      | Shared deterministic engine (`packages/shared/src/combat.ts`): PvE turn battles, `simulateDuel` for friend duels; creature XP via `battleXp`.          | Training and arena use it as is; no second battle system.                                                                                             |
| Economy     | Gold (ledger, append-only, idempotent purchases), items/inventory, shop, crafting, cosmetics (`player_cosmetics`), daily missions.                     | Hub rewards, houses, furniture and the item market all in Gold through the ledger.                                                                    |
| On-chain    | Creature NFTs on NEAR testnet with the game's own market (5 % fee) and NEAR tips; wallet linking, adults only.                                         | Untouched. The hub market is **off-chain only** (Gold, game items); NFTs keep their market.                                                           |
| Social      | Friends by code (same age group only), face-to-face trades and duels, **no free text between players** by design.                                      | Friends list, profiles and duels are reused; chat is the main conflict (§4.1).                                                                        |
| Admin       | `/admin/v1` with bearer tokens, two roles, append-only audit log; events at places.                                                                    | NPCs, hub config, seasons, fees, chat moderation as new admin routes, all audited.                                                                    |
| Anti-cheat  | Movement plausibility, risk score, review cases, mock-location lock, Play Integrity.                                                                   | Hub actions are rate-limited and server-validated; the hub gives no reason to fake GPS.                                                               |

## 2. Proposed architecture (smallest compatible)

```
app.nyrgo.fun (React PWA)                     api.nyrgo.fun (Fastify, Render)
├─ Map / Collection / … (unchanged)           ├─ REST (unchanged) + /v1/hub/* REST
└─ Hub screen ──────── WebSocket ───────────► ├─ /v1/hub/ws  (positions, chat, emotes)
   ├─ Canvas 2D town renderer                 │   in-memory rooms per district,
   ├─ keyboard / touch joystick               │   10 Hz movement, interest radius
   └─ panels in React (shop, house, arena…)   └─ Postgres: hub_xp, houses, listings,
                                                  arena ratings, quests, chat reports
```

- **Real time**: one WebSocket per player while the hub is open. The server holds positions in
  memory per district room and sends each client only players within its view (interest
  management), at most 10 updates per second. Moves are validated (speed, walls) server-side.
  One Render instance handles a few hundred concurrent hub players; growing past it needs Postgres
  `LISTEN/NOTIFY` or Redis between instances (Phase 5).
- **Everything that matters is REST + Postgres**, not the socket: rewards, purchases, houses,
  ratings, quests. The socket only carries presence, movement, chat and emotes, so a dropped
  connection loses nothing.
- **Town map**: a tile map in JSON (districts, collisions, doors, NPC spots) drawn on Canvas from a
  sprite atlas; districts load lazily; off-screen sprites are not animated.
- **Interiors** (houses, gym, arena): instanced per visit, not a persistent physical world.

## 3. The 50 % hub progression rule

Keep one level and one curve, and split the XP by source:

- `players.main_xp` — walking, places, captures, outdoor missions (all current sources).
- `players.hub_xp` — training, arena, hub quests, social activities.
- **Counted XP = main_xp + min(hub_xp, main_xp)**, and `level = levelForXp(counted XP)`.

So the hub can never be more than half of the XP behind any level, for any level and on the real
non-linear curve: to count 1,000 hub XP a player needs 1,000 earned outdoors. Hub XP beyond that is
kept (it starts counting as soon as the player plays outside again), never lost. It is enforced
in `grantReward()`, the single place XP is granted today, inside the same transaction; existing XP
migrates as `main_xp`. The profile shows both bars and how much hub XP is "waiting".
Daily hub XP limits and diminishing returns on repeated training stop farming on top of it.

## 4. Conflicts and risks

1. **Chat with minors.** The game admits players from 14 (16 outside Spain) and today has no free
   text between players on purpose. Open public chat with minors would need real-time moderation,
   reporting, filtering and logging, plus legal review. Proposal: **emotes and preset phrases for
   everyone; free-text chat only between adults** (age band from the account), with block,
   report, rate limits and admin moderation.
2. **Art.** The brief asks for pixel art. There is no tileset today and no image generation here;
   the town can be drawn with original **code-drawn pixel art** (tiles, buildings, NPCs) built to be
   replaced by a real tileset later without code changes. A commissioned or owner-supplied tileset
   would look better.
3. **Hosting.** WebSockets work on the current Render `starter` instance, but it is one instance;
   Render restarts drop connections (clients reconnect). Fine for the MVP.
4. **Economy.** Houses, furniture and hub rewards in Gold; the daily Gold cap already limits
   gameplay income. The hub market is a second (off-chain) market next to the NFT one; it must not
   accept NFTs or NEAR.
5. **Scope.** Each phase below is a release of its own; Phase 2 alone is a large piece of work.

## 5. Phases

| Phase                 | Delivers                                                                                                                                                                                                                                            |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2. Hub MVP            | Hub screen, Central Plaza drawn on Canvas, movement (keys + joystick), collisions, other players in real time, emotes (+ adult chat per §4.1), NPCs, companion following the player, return to the map. XP split migration (no hub XP sources yet). |
| 3. Training and arena | Gym (NPC training with the existing engine, daily limits), arena (casual + ranked with Elo, match history), the 50 % rule live, profile breakdown.                                                                                                  |
| 4. Market and housing | Off-chain item market (listings, expiry, fees, atomic purchase), residential district, houses, furniture placement, visits with privacy.                                                                                                            |
| 5. Events and polish  | Quest board, tournaments, seasons, achievements, better animations, scaling, monitoring.                                                                                                                                                            |
