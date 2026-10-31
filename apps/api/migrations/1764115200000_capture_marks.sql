-- Up Migration
-- Where creatures were caught, coarsely, for the world globe on the website. Only a half-degree
-- cell (about 50 km) is kept, never the exact spot; only adults' catches; kept 90 days.
CREATE TABLE capture_marks (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  definition_id text NOT NULL,
  cell_lat real NOT NULL,
  cell_lng real NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX capture_marks_recent ON capture_marks (created_at);

-- earlier catches whose place is still known
INSERT INTO capture_marks (user_id, definition_id, cell_lat, cell_lng, created_at)
SELECT ca.user_id, s.definition_id,
       floor(ST_Y(s.geom::geometry) * 2) / 2 + 0.25,
       floor(ST_X(s.geom::geometry) * 2) / 2 + 0.25,
       ca.created_at
  FROM capture_attempts ca
  JOIN spawns s ON s.id = ca.spawn_id
  JOIN users u ON u.id = ca.user_id
 WHERE ca.success AND u.age_band = '18+' AND ca.created_at > now() - interval '90 days';

-- Down Migration
DROP TABLE IF EXISTS capture_marks;
