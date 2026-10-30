-- Up Migration
-- Friends (by code, same age group) and face-to-face trades of in-game creatures.
ALTER TABLE players ADD COLUMN friend_code text UNIQUE;

CREATE TABLE friendships (
  -- one row per pair, smallest id first
  user_a uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  user_b uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('pending', 'accepted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  PRIMARY KEY (user_a, user_b),
  CHECK (user_a < user_b)
);
CREATE INDEX friendships_b ON friendships (user_b);

CREATE TABLE trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  to_user uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  give_creature uuid NOT NULL REFERENCES creature_instances (id) ON DELETE CASCADE,
  want_creature uuid NOT NULL REFERENCES creature_instances (id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('pending', 'done', 'declined', 'cancelled', 'expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  finished_at timestamptz,
  CHECK (from_user <> to_user)
);
CREATE INDEX trades_to ON trades (to_user, status);
CREATE INDEX trades_from ON trades (from_user, status);

-- Down Migration
DROP TABLE IF EXISTS trades;
DROP TABLE IF EXISTS friendships;
ALTER TABLE players DROP COLUMN IF EXISTS friend_code;
