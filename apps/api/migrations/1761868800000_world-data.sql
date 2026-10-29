-- Up Migration
-- World data for milestone 3: POI provenance and biome, exclusion zone provenance,
-- one report per player and POI, and a helper that says whether a point is off limits.

-- A node and a way can share a numeric id, so POIs are keyed by 'n123' / 'w123' / 'r123'.
ALTER TABLE pois DROP COLUMN osm_id;
ALTER TABLE pois
  ADD COLUMN osm_ref text UNIQUE,
  ADD COLUMN source text NOT NULL DEFAULT 'osm' CHECK (source IN ('osm', 'seed', 'admin')),
  ADD COLUMN biome text NOT NULL DEFAULT 'urban',
  ADD COLUMN tags jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN imported_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE exclusion_zones
  ADD COLUMN osm_ref text UNIQUE,
  ADD COLUMN imported_at timestamptz NOT NULL DEFAULT now();
-- Earlier rows default to 'osm'; widen the allowed sources.
ALTER TABLE exclusion_zones
  ADD CONSTRAINT exclusion_zones_source_check CHECK (source IN ('osm', 'seed', 'admin'));

CREATE TABLE poi_reports (
  user_id     uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  poi_id      uuid NOT NULL REFERENCES pois ON DELETE CASCADE,
  reason      text NOT NULL CHECK (reason IN ('unsafe', 'private', 'inaccessible', 'other')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, poi_id)
);

-- True when the point lies inside an exclusion zone whose kind is not in `ignore`.
-- Spawns use every zone; POIs ignore 'water' so landmarks on bridges stay visible.
CREATE FUNCTION is_excluded(p geography, ignore text[] DEFAULT '{}') RETURNS boolean
  LANGUAGE sql STABLE PARALLEL SAFE AS $$
    SELECT EXISTS (
      SELECT 1 FROM exclusion_zones z
       WHERE ST_Intersects(z.geom, p) AND NOT (z.kind = ANY (ignore))
    )
  $$;

-- Down Migration
DROP FUNCTION IF EXISTS is_excluded(geography, text[]);
DROP TABLE IF EXISTS poi_reports;
ALTER TABLE exclusion_zones DROP CONSTRAINT IF EXISTS exclusion_zones_source_check;
ALTER TABLE exclusion_zones DROP COLUMN IF EXISTS imported_at, DROP COLUMN IF EXISTS osm_ref;
ALTER TABLE pois
  DROP COLUMN IF EXISTS imported_at,
  DROP COLUMN IF EXISTS tags,
  DROP COLUMN IF EXISTS biome,
  DROP COLUMN IF EXISTS source,
  DROP COLUMN IF EXISTS osm_ref;
ALTER TABLE pois ADD COLUMN osm_id bigint UNIQUE;
