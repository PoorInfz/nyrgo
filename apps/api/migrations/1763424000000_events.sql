-- Up Migration
-- Events: a creature (usually legendary or mythic, which never appear wild) shows up at a place
-- for a set time, for everyone there. Scheduled by an admin; the spawn is an ordinary spawn row.
CREATE TABLE events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 60),
  poi_id uuid NOT NULL REFERENCES pois (id),
  definition_id text NOT NULL REFERENCES creature_definitions,
  level int NOT NULL CHECK (level BETWEEN 1 AND 50),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL CHECK (ends_at > starts_at),
  spawn_id uuid,
  cancelled_at timestamptz,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX events_time ON events (ends_at) WHERE cancelled_at IS NULL;

ALTER TABLE spawns ADD COLUMN event_id uuid REFERENCES events (id) ON DELETE SET NULL;

-- Down Migration
ALTER TABLE spawns DROP COLUMN IF EXISTS event_id;
DROP TABLE IF EXISTS events;
