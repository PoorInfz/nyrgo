-- Up Migration
-- Milestone 8: place visits, shop, crafting, daily missions and evolution.

-- Last visit per player and place, for the per-place cooldown.
CREATE TABLE poi_visits (
  user_id        uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  poi_id         uuid NOT NULL REFERENCES pois ON DELETE CASCADE,
  last_visit_at  timestamptz NOT NULL DEFAULT now(),
  visits         int NOT NULL DEFAULT 1 CHECK (visits > 0),
  PRIMARY KEY (user_id, poi_id)
);

-- An evolution keeps the creature (same row, new definition); remember where it came from.
ALTER TABLE creature_instances ADD COLUMN evolved_from text REFERENCES creature_definitions;

-- Down Migration
ALTER TABLE creature_instances DROP COLUMN IF EXISTS evolved_from;
DROP TABLE IF EXISTS poi_visits;
