-- Up Migration
-- Phase 3: link a NEAR account to a player by a signed message (NEP-413). Adults only; testnet
-- until the Phase 6 gates. No keys are ever stored, only the account id and the public key that
-- signed.

-- One-time challenges: the nonce the wallet must sign, valid for a few minutes, used once.
CREATE TABLE wallet_challenges (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  nonce       bytea NOT NULL UNIQUE CHECK (octet_length(nonce) = 32),
  message     text NOT NULL,
  network     text NOT NULL CHECK (network IN ('testnet', 'mainnet')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz
);
CREATE INDEX wallet_challenges_user_idx ON wallet_challenges (user_id, created_at DESC);

-- At most one linked account per player, and a NEAR account links to one player at a time.
CREATE TABLE wallet_links (
  user_id     uuid PRIMARY KEY REFERENCES users ON DELETE CASCADE,
  network     text NOT NULL CHECK (network IN ('testnet', 'mainnet')),
  account_id  text NOT NULL CHECK (char_length(account_id) BETWEEN 2 AND 64),
  public_key  text NOT NULL,
  linked_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (network, account_id)
);

-- Down Migration
DROP TABLE IF EXISTS wallet_links;
DROP TABLE IF EXISTS wallet_challenges;
