-- Up Migration
-- Milestone 4: movement state, manual review cases, and indexes for retention jobs.

-- Last movement verdict per player. Interactions read this instead of recomputing.
CREATE TABLE player_movement (
  user_id         uuid PRIMARY KEY REFERENCES users ON DELETE CASCADE,
  last_fix_at     timestamptz NOT NULL,
  last_speed_kmh  real,
  locked_until    timestamptz,
  lock_reason     text CHECK (lock_reason IN ('teleport')),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Accounts waiting for a human. Opened automatically at the review threshold; never closed
-- automatically, and nothing here bans anyone.
CREATE TABLE review_cases (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  reason        text NOT NULL,
  risk_at_open  smallint NOT NULL,
  opened_at     timestamptz NOT NULL DEFAULT now(),
  closed_at     timestamptz,
  reviewer_id   uuid,
  decision      text CHECK (decision IN ('no_action', 'warning', 'restricted', 'appeal_upheld')),
  notes         text,
  CHECK ((status = 'open') = (closed_at IS NULL))
);
CREATE UNIQUE INDEX review_cases_one_open ON review_cases (user_id) WHERE status = 'open';

CREATE INDEX location_samples_created_idx ON location_samples (created_at);
CREATE INDEX location_samples_precise_idx ON location_samples (created_at) WHERE geom IS NOT NULL;
CREATE INDEX risk_signals_kind_idx ON risk_signals (user_id, kind, created_at);
CREATE INDEX risk_signals_created_idx ON risk_signals (created_at);
CREATE INDEX magic_links_expiry_idx ON magic_links (expires_at);

-- Decayed risk: each signal loses half its weight every `half_life_h` hours; capped at 100.
CREATE FUNCTION risk_score(uid uuid, half_life_h real) RETURNS smallint
  LANGUAGE sql STABLE AS $$
    SELECT LEAST(100, round(COALESCE(sum(
             score * power(0.5, extract(epoch FROM now() - created_at) / 3600.0 / half_life_h)
           ), 0)))::smallint
      FROM risk_signals
     WHERE user_id = uid AND created_at > now() - interval '90 days'
  $$;

-- Down Migration
DROP FUNCTION IF EXISTS risk_score(uuid, real);
DROP INDEX IF EXISTS magic_links_expiry_idx;
DROP INDEX IF EXISTS risk_signals_created_idx;
DROP INDEX IF EXISTS risk_signals_kind_idx;
DROP INDEX IF EXISTS location_samples_precise_idx;
DROP INDEX IF EXISTS location_samples_created_idx;
DROP TABLE IF EXISTS review_cases;
DROP TABLE IF EXISTS player_movement;
