# Friends, trades and events

## Friends

- Every player has a friend code (8 characters, no look-alike letters), shown in the **Friends**
  tab. It is meant to be shared in person.
- `POST /v1/friends {code}` sends a request; if the other player already asked, it makes you
  friends at once. Up to 200 friends and 20 requests a day.
- Adults and minors cannot be friends with each other (`friend_age_mismatch`).
- Friends see a display name, level and how many species were caught. They never see a
  location.

## Face-to-face trades

- One creature for one, between friends. A creature that is an NFT, or in a battle, cannot be
  traded (NFTs go through the market instead).
- A proposal lasts 10 minutes. The friend accepts with `POST /v1/trades/:id/accept`, and the
  server checks that **both** players' latest location fixes are under 120 s old and no more than
  100 m apart. In practice, both players must have the map open next to each other.
- 5 completed trades a day per player. The swap happens in one transaction. Each creature
  keeps its level and values, and new species are added to the receiver's dex.

## Friendly duels

- A player challenges a friend with one creature (`POST /v1/duels {to, creature}`); the challenge
  lasts 10 minutes, and a new one to the same friend replaces it.
- The friend answers with one of theirs (`POST /v1/duels/:id/accept {creature}`) while both stand
  together (the same 100 m / 2 minute rule as trades). The server then fights it out with the
  normal combat rules, each side choosing moves like a wild creature, from a random seed that is
  kept with the result.
- Creatures fight at full health. Nothing changes hands and no HP, XP or items are won or lost, so
  there is nothing to farm. 10 duels a day per player.
- `GET /v1/duels` returns open challenges and the last day's results with the full turn log, so
  both players can replay the same fight.

## Events at places

- An admin schedules an event from the admin panel (`app.nyrgo.fun/admin`, **Events** section):
  find the place by name (optionally near a `lat, lng`), pick the creature, level, start and
  duration, write the reason and create it. Every action is audited. The same through the API:
  - `GET /admin/v1/pois/search?q=&lat=&lng=` finds places by name, nearest first
  - `POST /admin/v1/events` with `{title, poiId, creatureId, level, startsAt, durationMin, reason}`
  - `POST /admin/v1/events/:id/cancel` with `{reason}`
  - `GET /admin/v1/events`
- The event's creature is a normal spawn at the place, visible to everyone there. It is not
  scaled to the player's level, so a legendary event really is level 30.
- `GET /v1/events?lat&lng` (public) lists events running now or within 7 days, within 30 km. The
  app shows them on the map screen, with an "Event" badge on the creature.

## Not done yet

- Trades and duels do not involve NEAR or NFTs. Duels give no rewards on purpose.
- Proximity relies on each player's reported location. The anti-cheat signals (speed,
  teleport, mock location, device check) apply as they do everywhere else.
