-- Up Migration
-- The explorer's look on the map, and the cosmetics each player has bought with Gold.
ALTER TABLE players ADD COLUMN avatar jsonb;

CREATE TABLE player_cosmetics (
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  item_id text NOT NULL,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_id)
);

-- Down Migration
DROP TABLE IF EXISTS player_cosmetics;
ALTER TABLE players DROP COLUMN IF EXISTS avatar;
