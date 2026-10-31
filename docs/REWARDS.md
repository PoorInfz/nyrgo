# Rewards in NEAR, paid by trading (testnet)

**Status:** NEAR testnet. Mainnet stays closed until the Phase 6 gates: anti-cheat that holds on
native clients (GPS spoofing) and a legal review (payments to players, consumer and tax rules).

Players are rewarded in **native NEAR**, and only with what trading brings in. The nyrGo! test
token (below) does not pay anything itself; it only raises the NEAR tip of the players who hold it:

## Where the NEAR comes from

The creatures contract (`contracts/creatures`) sends trading fees to the **treasury**,
`rewards.<game account>` (`rewards.nyrgo.testnet`):

- **Royalties (NEP-199):** 5 % of every resale of a creature NFT on outside NEAR marketplaces
  that honour payouts (`nft_payout`, `nft_transfer_payout`).
- **The game's market:** 5 % of every sale through `market_buy`. Sellers list with
  `market_list` (0.01 NEAR deposit, returned when the listing ends); the contract transfers the
  creature and pays the seller in the same call.

Fees are capped at 20 % in the contract; `set_market` (game account) changes them.

## How players earn it: tips for walking to a creature and catching it

A successful catch pays a **tip of 0.005 NEAR** when:

- the player is 18+ and has linked a NEAR account;
- the last tip was at least **1 hour** ago;
- the creature was caught at least **100 m** from where the last tip was earned;
- the player has had fewer than **5 tips** today (local day);
- the account is not under anti-cheat review (risk below 35, no open case);
- **today's budget** has room.

All of this is in `DEFAULT_CONFIG.tips` (`packages/shared/src/config.ts`).

## Budget and payouts

Once per UTC day the API reads the treasury's balance and allows **3 %** of what is beyond a
0.1 NEAR reserve to be paid out that day, so the pot never empties at once and only fee income
is ever paid. A job sends pending tips every minute from the treasury. If NEAR refuses a
transfer, its budget comes back; if NEAR does not answer, the tip is marked `unknown` for a
person to check, so nothing is ever paid twice.

`GET /v1/rewards` shows the pot publicly; `GET /v1/me/tips` shows a player's tips.

With no trading yet, the treasury holds only its starting 0.2 NEAR and the daily budget is below
one tip: tips start once fees come in.

## Holder ranks (test token, testnet)

`contracts/token` is a plain NEP-141 token, **NYRGO**, on testnet only: 1,000,000,000 tokens
minted once to the game account, no further minting, never sold, no value. The workflow
"Deploy test token (testnet)" creates `token.<game account>` and can send test tokens to accounts
so ranks can be tried.

Every hour (`holders` job) the API reads `ft_balance_of` for each adult's linked account and
keeps the reading for 48 hours (`holder_snapshots`). A player's rank is the highest one reached by
the **smallest balance of the last 24 hours**, and only once the account has been watched for the
whole 24 hours: tokens bought just before a catch and sold after it count for nothing. Readings
older than 6 hours grant nothing (the job has stopped). "Check again now" in the profile reads the
balance at once (6 times per 10 minutes).

| Rank | NYRGO held (share of supply) | NEAR tip | Outfits |
| ---- | ---------------------------- | -------- | ------- |
| 1    | 1,000,000 (0.1 %)            | +10 %    |         |
| 2    | 3,000,000 (0.3 %)            | +15 %    |         |
| 3    | 5,000,000 (0.5 %)            | +25 %    | yes     |
| 4    | 10,000,000 (1 %)             | +50 %    | yes     |
| 5    | 20,000,000 (2 %)             | +100 %   | yes     |

Ranks are fixed amounts (`HOLDER_TIERS` in `packages/shared/src/token.ts`), so they do not get
harder as more people hold. The boost comes out of the same daily budget, and at most **25 %** of
a day's budget may go to boosts (`tips_pool.boost_spent_yocto`); once that share is used, tips are
paid without the boost. A refused tip returns its whole amount to the day's budget but not its
boost share (the boost share only ever errs on the side of paying less).

Holder outfits (22 looks drawn as the game's own chibi explorer, inspired by the owner's character
sheet) can be worn from rank 3. When a
rank drops below 3, the next hourly job takes the outfit off.
