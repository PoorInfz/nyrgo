# NYRGO — the nyrGo! token (testnet)

**Status:** testnet only. Mainnet stays closed until the Phase 6 gates: anti-cheat that holds on
native clients (GPS spoofing) and a legal review (MiCA white paper or exemption, consumer and tax
rules). On testnet the tokens have no value.

## Contract

- NEP-141 fungible token with NEP-145 storage and NEP-148 metadata (`contracts/token`).
- Symbol `NYRGO`, 18 decimals, **1,000,000,000** tokens created once, at initialisation, in the
  game account. **No mint function exists**: the supply can never grow.
- Forced storage unregistering is disabled, so no balance can be burned by accident.
- Deployed by the workflow "Deploy token (testnet)" to `token.<game account>`.

## Earning (play to earn)

Players **aged 18+** earn whole NYRGO for rewarded gameplay (`DEFAULT_CONFIG.token` in
`packages/shared/src/config.ts`):

| Event                   | NYRGO |
| ----------------------- | ----- |
| Successful capture      | 2     |
| PvE battle won          | 3     |
| Place visited           | 1     |
| Daily mission completed | 10    |

- At most **50 NYRGO per player per local day**.
- At most **200,000 NYRGO per UTC day for the whole game**: the rewards share pays out over years,
  not weeks, whatever the number of players.
- Earnings go to an append-only ledger in the game's database; nothing is on chain until a claim.

## Claiming

`POST /v1/me/token/claim` sends the whole unclaimed balance to the player's linked NEAR account
(registering it for storage at the game's cost). It is refused when:

- the player is under 18, has no linked wallet, or the token is off;
- the account is younger than **7 days** (fresh farm accounts wait);
- the anti-cheat risk score is **35 or more**, or the account has an open review case;
- the last claim was less than **24 h** ago, or the balance is below **10 NYRGO**.

The balance leaves the ledger before the transfer. If NEAR refuses the transfer, it comes back;
if NEAR does not answer, the claim is marked `unknown` and kept for a person to check, so a
transfer that went through is never paid twice.

## Suggested distribution (to decide before mainnet)

| Share | Use                                                  |
| ----- | ---------------------------------------------------- |
| 50 %  | Play rewards (paid out through the daily caps above) |
| 20 %  | Liquidity (a NYRGO/NEAR pool on Ref Finance)         |
| 15 %  | Team, locked with vesting                            |
| 15 %  | Treasury (events, partners, sponsored places)        |

On testnet the whole supply stays in the game account.

## Making it tradeable

On NEAR a token trades once a pool exists on a DEX such as Ref Finance: create `NYRGO/wNEAR`
and add liquidity. This can be tried on testnet; on mainnet the liquidity is real money and comes
after the legal review.
