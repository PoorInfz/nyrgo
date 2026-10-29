-- Up Migration
-- Phase 2 tuning: a wild creature meets each player at most a few levels above the player's own
-- level. The spawn is shared, so the level a player faces is kept on their encounter.
ALTER TABLE encounters ADD COLUMN level int CHECK (level IS NULL OR level > 0);

-- Down Migration
ALTER TABLE encounters DROP COLUMN IF EXISTS level;
