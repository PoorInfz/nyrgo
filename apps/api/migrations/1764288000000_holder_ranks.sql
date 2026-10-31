-- Up Migration
-- Test token holders (testnet): the token balance of each linked account, read every hour.
-- A rank counts the smallest balance kept over the last days, so buying just before a catch
-- and selling after it gains nothing. Rows older than the window are deleted by the job.
CREATE TABLE holder_snapshots (
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  account_id text NOT NULL,
  taken_at   timestamptz NOT NULL DEFAULT now(),
  balance    numeric(40, 0) NOT NULL CHECK (balance >= 0),
  PRIMARY KEY (user_id, taken_at)
);

-- Tips record the rank's boost; the day's pool records how much went to boosts (capped).
ALTER TABLE tips ADD COLUMN boost_pct integer NOT NULL DEFAULT 0 CHECK (boost_pct >= 0);
ALTER TABLE tips_pool ADD COLUMN boost_spent_yocto numeric(40, 0) NOT NULL DEFAULT 0
  CHECK (boost_spent_yocto >= 0);

-- Down Migration
ALTER TABLE tips_pool DROP COLUMN IF EXISTS boost_spent_yocto;
ALTER TABLE tips DROP COLUMN IF EXISTS boost_pct;
DROP TABLE IF EXISTS holder_snapshots;
