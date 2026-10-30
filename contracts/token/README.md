# NYRGO token contract (testnet)

NEP-141 fungible token (with NEP-145 storage management and NEP-148 metadata) on NEAR's
`near-contract-standards` 5.30. The whole supply is created once, at initialisation, in the game
account; there is no mint function, so it can never grow. Players receive NYRGO by transfer when
they claim what they earned playing (see `docs/TOKEN.md`). Forced storage unregistering is
disabled so no one can burn tokens by accident.

```bash
cargo test
cargo near build non-reproducible-wasm   # → target/near/nyrgo_token.wasm
```

Deployed by the "Deploy token (testnet)" workflow to `token.<game account>`.
