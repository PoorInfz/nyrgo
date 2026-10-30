# nyrGo! creatures NFT contract (testnet)

NEP-171 NFTs on NEAR's `near-contract-standards` 5.30. The NFT is the creature: whoever holds the
token has the creature in the game. Only the game account (`owner_id`) can mint, and only species it registered, each up to its
fixed supply; every token's title carries its edition ("Gwisp #12/1000"). See `docs/nft/`.

## Test

```bash
cargo test
```

## Build

Needs the `wasm32-unknown-unknown` target and [cargo-near](https://github.com/near/cargo-near)
(CI does this on every push; the artifact is `nyrgo-creatures-wasm`):

```bash
rustup target add wasm32-unknown-unknown
cargo near build non-reproducible-wasm      # → target/near/nyrgo_creatures.wasm
```

## Deploy to testnet

One game account does everything: it owns the contract, mints and pays each token's storage.

1. Create the game account in a testnet wallet (e.g. `nyrgo-game.testnet`, funded by the testnet
   faucet with at least 7 NEAR) and export its secret key (`ed25519:…`).
2. Save that key as the repository secret `NEAR_TESTNET_GAME_KEY` (GitHub → Settings → Secrets and
   variables → Actions). It is only read by the deploy workflow and never printed.
3. Run **Actions → Deploy NFT contract (testnet) → Run workflow**, first with "dry run" on to see
   what it would do, then off. It creates `creatures.<game account>` (5 NEAR for storage, same key),
   deploys and initialises the contract with the game account as owner, and registers all 50
   species with their fixed supply. Running it again only does what is missing; "upgrade" replaces
   the code and keeps the state.

The same can be run locally:

```bash
NEAR_GAME_ACCOUNT=nyrgo-game.testnet NEAR_GAME_KEY=ed25519:… \
  pnpm --filter @nyrgo/api nft:deploy --wasm ../../contracts/creatures/target/near/nyrgo_creatures.wasm --dry-run
```

Then set in the API's environment: `NEAR_NFT_CONTRACT=creatures.nyrgo-game.testnet`,
`NEAR_MINTER_ACCOUNT=nyrgo-game.testnet` and `NEAR_MINTER_KEY` (the same key). Minting attaches a
storage deposit, which NEAR only allows from a full-access key, so this key cannot be narrowed to
a function-call key; keep the game account's balance small and top it up as needed.
