-- Up Migration
-- Device attestation (Play Integrity) from the Android app. A nonce is single-use and short-lived;
-- a passed check makes the player "verified" for a day, which NEAR rewards can require.
CREATE TABLE attest_nonces (
  nonce text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE INDEX attest_nonces_expiry ON attest_nonces (expires_at);

CREATE TABLE device_attestations (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  ok boolean NOT NULL,
  -- the verdicts Google gave, without identifiers (no account or device ids)
  verdict jsonb NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX device_attestations_user ON device_attestations (user_id, created_at DESC);

-- Down Migration
DROP TABLE IF EXISTS device_attestations;
DROP TABLE IF EXISTS attest_nonces;
