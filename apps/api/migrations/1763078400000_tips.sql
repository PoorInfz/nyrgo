-- Up Migration
-- NEAR tips for walking to a creature and catching it, paid from the treasury (trading fees).
CREATE TABLE tips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  network text NOT NULL,
  account_id text NOT NULL,
  amount_yocto numeric(40, 0) NOT NULL CHECK (amount_yocto > 0),
  -- where the creature was caught: the next tip must be far enough from here
  geom geography(Point, 4326) NOT NULL,
  capture_id uuid NOT NULL UNIQUE,
  -- pending: waiting for the payout job; sending: in flight; sent: on chain;
  -- failed: refused by NEAR (budget returned); unknown: no answer, kept for a person to check
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'unknown')),
  tx_hash text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX tips_user ON tips (user_id, created_at DESC);
CREATE INDEX tips_todo ON tips (created_at) WHERE status IN ('pending', 'sending');

-- What each UTC day may pay out, set once a day from the treasury's balance.
CREATE TABLE tips_pool (
  day date PRIMARY KEY,
  treasury_yocto numeric(40, 0) NOT NULL,
  budget_yocto numeric(40, 0) NOT NULL CHECK (budget_yocto >= 0),
  spent_yocto numeric(40, 0) NOT NULL DEFAULT 0 CHECK (spent_yocto >= 0),
  set_at timestamptz NOT NULL DEFAULT now()
);

-- Down Migration
DROP TABLE IF EXISTS tips_pool;
DROP TABLE IF EXISTS tips;
