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

## Events at places

- An admin schedules an event: a creature and level at a place (POI), with a start time and a
  15–240 minute duration. Every action is audited:
  - `POST /admin/v1/events` with `{title, poiId, creatureId, level, startsAt, durationMin, reason}`
  - `POST /admin/v1/events/:id/cancel` with `{reason}`
  - `GET /admin/v1/events`
- The event's creature is a normal spawn at the place, visible to everyone there. It is not
  scaled to the player's level, so a legendary event really is level 30.
- `GET /v1/events?lat&lng` (public) lists events running now or within 7 days, within 30 km. The
  app shows them on the map screen, with an "Event" badge on the creature.

## Not done yet

- There is no admin screen for events yet; use the API with an admin token.
- Trades do not involve NEAR or NFTs.
- Proximity relies on each player's reported location. The anti-cheat signals (speed,
  teleport, mock location, device check) apply as they do everywhere else.
