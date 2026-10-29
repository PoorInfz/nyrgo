-- Up Migration
-- Milestone 7: turn-based battles against wild creatures, resolved on the server.

ALTER TABLE battles
  ADD COLUMN encounter_id uuid REFERENCES encounters ON DELETE SET NULL,
  ADD COLUMN instance_id uuid REFERENCES creature_instances ON DELETE SET NULL,
  ADD COLUMN state jsonb,
  ADD COLUMN turn int NOT NULL DEFAULT 0 CHECK (turn >= 0),
  ADD COLUMN rewarded boolean NOT NULL DEFAULT false,
  ADD COLUMN finished_at timestamptz;
-- One battle at a time per encounter.
CREATE UNIQUE INDEX battles_one_active ON battles (encounter_id) WHERE result IS NULL;

-- The wild creature's HP carries over between battles in one encounter; a worn-out creature is
-- easier to capture.
ALTER TABLE encounters
  ADD COLUMN foe_hp int CHECK (foe_hp >= 0),
  ADD COLUMN foe_max_hp int CHECK (foe_max_hp > 0),
  ADD COLUMN won_at timestamptz;

-- Owned creatures recover HP over time from this moment.
ALTER TABLE creature_instances ADD COLUMN hp_updated_at timestamptz NOT NULL DEFAULT now();
-- Creature XP now follows the level curve (20·L·(L−1)); start existing creatures at their level.
UPDATE creature_instances SET xp = 20 * level * (level - 1) WHERE xp < 20 * level * (level - 1);

-- Down Migration
ALTER TABLE creature_instances DROP COLUMN IF EXISTS hp_updated_at;
ALTER TABLE encounters DROP COLUMN IF EXISTS won_at, DROP COLUMN IF EXISTS foe_max_hp,
  DROP COLUMN IF EXISTS foe_hp;
DROP INDEX IF EXISTS battles_one_active;
ALTER TABLE battles DROP COLUMN IF EXISTS finished_at, DROP COLUMN IF EXISTS rewarded,
  DROP COLUMN IF EXISTS turn, DROP COLUMN IF EXISTS state, DROP COLUMN IF EXISTS instance_id,
  DROP COLUMN IF EXISTS encounter_id;
