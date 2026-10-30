-- Up Migration
-- NYRGO earned by playing (whole tokens) and claimed to a linked NEAR account. The ledger is
-- append-only: earnings are positive, claims negative, a refunded claim positive again; a
-- player's unclaimed balance is the sum.
CREATE TABLE token_ledger (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  amount bigint NOT NULL CHECK (amount <> 0),
  reason text NOT NULL,
  ref_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX token_ledger_user ON token_ledger (user_id, created_at);
CREATE INDEX token_ledger_earned ON token_ledger (created_at) WHERE amount > 0;

CREATE TABLE token_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  network text NOT NULL,
  account_id text NOT NULL,
  amount bigint NOT NULL CHECK (amount > 0),
  -- sending: in flight; sent: on chain; failed: refused by the chain, refunded;
  -- unknown: no answer from NEAR, kept for a person to check (never paid twice)
  status text NOT NULL CHECK (status IN ('sending', 'sent', 'failed', 'unknown')),
  tx_hash text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX token_claims_user ON token_claims (user_id, created_at DESC);

-- Down Migration
DROP TABLE IF EXISTS token_claims;
DROP TABLE IF EXISTS token_ledger;
