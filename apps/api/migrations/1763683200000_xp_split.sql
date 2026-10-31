-- Up Migration
-- XP by source: the outdoor game and the hub (town). `xp` stays the counted XP that sets the
-- level, so everything that reads it keeps working; all XP earned so far was outdoors.
ALTER TABLE players ADD COLUMN main_xp bigint NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN hub_xp bigint NOT NULL DEFAULT 0;
UPDATE players SET main_xp = xp;
ALTER TABLE players ADD CONSTRAINT players_xp_sources CHECK (main_xp >= 0 AND hub_xp >= 0);

-- Down Migration
ALTER TABLE players DROP CONSTRAINT IF EXISTS players_xp_sources;
ALTER TABLE players DROP COLUMN IF EXISTS hub_xp;
ALTER TABLE players DROP COLUMN IF EXISTS main_xp;
