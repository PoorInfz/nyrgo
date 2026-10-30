-- Up Migration
-- The game works anywhere: the world (places and exclusion zones) is loaded from OpenStreetMap
-- one H3 resolution-6 area (~36 km²) at a time, the first time someone plays there. Creatures
-- only appear in areas that are loaded, so they never land in a school or a home whose shape
-- we have not seen yet.
CREATE TABLE world_areas (
  h3_r6 h3index PRIMARY KEY,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'loading', 'ready', 'failed')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  loaded_at timestamptz,
  attempts int NOT NULL DEFAULT 0,
  pois int,
  exclusions int,
  error text
);
CREATE INDEX world_areas_todo ON world_areas (next_attempt_at) WHERE status IN ('pending', 'failed');

-- No area is marked loaded here: the pilot city's import was one box that covers none of its
-- areas whole, so they are loaded on demand like any other place.

-- Down Migration
DROP TABLE IF EXISTS world_areas;
