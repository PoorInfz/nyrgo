-- Up Migration
-- Playtest metrics: one row per player per UTC day they used the game (recorded when a signed-in
-- request arrives, at most once a day each), so daily actives and retention can be counted. Only
-- the day is kept, never the time or the place.
CREATE TABLE player_days (
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  day     date NOT NULL,
  PRIMARY KEY (user_id, day)
);
CREATE INDEX player_days_day ON player_days (day);

-- What the game already knows about past days, so retention starts with history.
INSERT INTO player_days (user_id, day)
SELECT DISTINCT user_id, (t AT TIME ZONE 'UTC')::date FROM (
  SELECT id AS user_id, created_at AS t FROM users WHERE status = 'active'
  UNION ALL SELECT user_id, created_at FROM capture_attempts
  UNION ALL SELECT user_id, started_at FROM encounters
  UNION ALL SELECT user_id, created_at FROM battles
  UNION ALL SELECT user_id, created_at FROM gold_ledger
  UNION ALL SELECT user_id, created_at FROM location_samples
  UNION ALL SELECT user_id, created_at FROM hub_activities
  UNION ALL SELECT user_id, last_seen_at FROM sessions
) a
WHERE EXISTS (SELECT 1 FROM users u WHERE u.id = a.user_id AND u.status = 'active')
ON CONFLICT DO NOTHING;

-- Comments players send from the game during the playtest.
CREATE TABLE feedback (
  id          bigserial PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  category    text NOT NULL CHECK (category IN ('bug', 'idea', 'fun', 'other')),
  body        text NOT NULL CHECK (char_length(body) BETWEEN 3 AND 1000),
  -- where it was sent from and on what: the screen, the app build, the browser
  screen      text,
  build       text,
  agent       text,
  lang        text,
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  closed_at   timestamptz
);
CREATE INDEX feedback_open ON feedback (created_at DESC) WHERE status = 'open';

-- Down Migration
DROP TABLE IF EXISTS feedback;
DROP TABLE IF EXISTS player_days;
