# Rewards in NEAR, paid by trading (testnet)

**Status:** NEAR testnet. Mainnet stays closed until the Phase 6 gates: anti-cheat that holds on
native clients (GPS spoofing) and a legal review (payments to players, consumer and tax rules).

There is no game token. Players are rewarded in **native NEAR**, and only with what trading
brings in:

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
