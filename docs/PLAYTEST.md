# Playtest guide

What to watch during the first closed playtest (10–30 people, one or two weeks), and where.

## Inviting players

- Send them to https://app.nyrgo.fun (or the Android app). They can play as a guest and save
  their progress with an email later; NEAR features are for adults only and on testnet.
- Ask them to use the 💬 button (top-left corner of every screen) for anything: bugs, ideas,
  what was fun. Each comment carries the screen it was sent from, the app version, the browser
  and the player's name and level; never their location. Up to 20 comments a day per player.

## Reading the results: /admin → Playtest

Admin panel at https://app.nyrgo.fun/admin with an `ADMIN_TOKENS` token (admin or reviewer).

| Block                                             | What it tells you                                                                                                                                                                                      |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tiles                                             | players, played today, played this week, active days per player, catches per player-day, comments to read                                                                                              |
| Players a day / New players a day / Catches a day | the daily trend for the chosen range (7, 14, 30 or 90 days)                                                                                                                                            |
| Retention by day joined                           | of the players who joined on a day, the share who played again on day 1, 3 and 7 (· = too early to tell)                                                                                               |
| First steps                                       | of the players who joined in the range: chose a starter → faced a creature → threw a vault → caught one → came back another day → still playing a week later. The biggest drop is where to look first. |
| Capture mini-game                                 | throws, average score, % perfect, % caught, throws by score, catch rate by rarity                                                                                                                      |
| Comments                                          | to read / dealt with; mark one done with an optional note (recorded in the audit log)                                                                                                                  |

Rough signs to look for in a small playtest: fewer than half choosing a starter or facing a
creature means onboarding is unclear; a day-1 return under ~25 % means the first session does
not hook; most throws under 0.2 means the mini-game is too hard (or not understood), most at 1
means it is too easy.

## What is counted, and for how long

- `player_days`: one row per player per UTC day with a signed-in request (no time, no place),
  kept 400 days, deleted with the account, included in the data export. The days before this
  table existed were filled in once from what the game already stored.
- `feedback`: the comments, deleted with the account, in the data export; closed ones are
  deleted after a year.
- Everything else comes from data the game already keeps (catches, encounters, battles).
