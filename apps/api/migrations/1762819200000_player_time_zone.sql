-- Up Migration
-- The game day (daily gold cap, missions, rewarded wins) follows each player's local time,
-- taken from where they last played. Existing players start on the pilot city's zone.
ALTER TABLE players ADD COLUMN time_zone text NOT NULL DEFAULT 'Europe/Madrid';

-- Down Migration
ALTER TABLE players DROP COLUMN IF EXISTS time_zone;
