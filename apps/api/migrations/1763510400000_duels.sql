-- Up Migration
-- Friendly duels between friends standing together: fought by the game, nothing is lost or won
-- except the record. The turn log is kept so both players can replay it.
CREATE TABLE duels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  to_user uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  from_creature uuid NOT NULL REFERENCES creature_instances (id) ON DELETE CASCADE,
  to_creature uuid REFERENCES creature_instances (id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('pending', 'done', 'declined', 'cancelled', 'expired')),
  -- 'from', 'to' or null for a draw
  winner text CHECK (winner IN ('from', 'to')),
  fight jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  finished_at timestamptz,
  CHECK (from_user <> to_user)
);
CREATE INDEX duels_to ON duels (to_user, status);
CREATE INDEX duels_from ON duels (from_user, status);

-- Down Migration
DROP TABLE IF EXISTS duels;
