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

## Deploy to testnet (not done yet)

With [near-cli-rs](https://github.com/near/near-cli-rs), from accounts you control:

```bash
# 1. a game account that mints and pays storage (fund it from the testnet faucet)
near account create-account sponsor-by-faucet-service nyrgo-game.testnet autogenerate-new-keypair save-to-keychain network-config testnet create

# 2. the contract account, deploy and initialise with the game account as owner
near account create-account sponsor-by-faucet-service nyrgo-creatures.testnet autogenerate-new-keypair save-to-keychain network-config testnet create
near contract deploy nyrgo-creatures.testnet use-file target/near/nyrgo_creatures.wasm \
  with-init-call new json-args '{"owner_id":"nyrgo-game.testnet","metadata":{"spec":"nft-1.0.0","name":"nyrGo! Creatures (testnet)","symbol":"NYRGO"}}' \
  prepaid-gas '100 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-keychain send
```

Register every species with its fixed supply (once; it can never be raised):

```bash
pnpm --filter @nyrgo/api nft:species > species.json
near contract call-function as-transaction nyrgo-creatures.testnet register_species \
  file-args species.json prepaid-gas '300 Tgas' attached-deposit '0 NEAR' \
  sign-as nyrgo-game.testnet network-config testnet sign-with-keychain send
```

Then set in the API's environment: `NEAR_NFT_CONTRACT=nyrgo-creatures.testnet`,
`NEAR_MINTER_ACCOUNT=nyrgo-game.testnet` and `NEAR_MINTER_KEY=ed25519:…` (the game account's key;
better, a function-call key limited to `nft_mint` on the contract with an allowance).
