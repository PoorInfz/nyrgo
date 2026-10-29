-- Up Migration
-- Milestone 5: columns for the approved creature content. Content lives in @nyrgo/shared and is
-- copied here by `content:sync` so collection rows can reference definitions with foreign keys.

ALTER TABLE creature_definitions DROP CONSTRAINT creature_definitions_check;
ALTER TABLE creature_definitions
  ADD COLUMN dex smallint UNIQUE,
  ADD COLUMN stage smallint NOT NULL DEFAULT 1 CHECK (stage BETWEEN 1 AND 3),
  ADD COLUMN archetype text NOT NULL DEFAULT 'balanced'
    CHECK (archetype IN ('balanced', 'tank', 'striker', 'swift')),
  ADD COLUMN wild boolean NOT NULL DEFAULT true,
  ADD COLUMN starter boolean NOT NULL DEFAULT false,
  ADD COLUMN evolve_hold_days smallint,
  ADD COLUMN lore_i18n jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN retired boolean NOT NULL DEFAULT false,
  -- An evolution needs a level, a holding period, or both.
  ADD CONSTRAINT creature_definitions_evolution_check
    CHECK (evolves_to IS NULL OR evolve_level IS NOT NULL OR evolve_hold_days IS NOT NULL);
ALTER TABLE creature_definitions DROP COLUMN lore;

ALTER TABLE item_definitions
  ADD COLUMN price int CHECK (price IS NULL OR price >= 0),
  ADD COLUMN retired boolean NOT NULL DEFAULT false;

ALTER TABLE recipes ADD COLUMN retired boolean NOT NULL DEFAULT false;

-- Down Migration
ALTER TABLE recipes DROP COLUMN IF EXISTS retired;
ALTER TABLE item_definitions DROP COLUMN IF EXISTS retired, DROP COLUMN IF EXISTS price;
ALTER TABLE creature_definitions ADD COLUMN lore text;
ALTER TABLE creature_definitions
  DROP CONSTRAINT IF EXISTS creature_definitions_evolution_check,
  DROP COLUMN IF EXISTS retired,
  DROP COLUMN IF EXISTS lore_i18n,
  DROP COLUMN IF EXISTS evolve_hold_days,
  DROP COLUMN IF EXISTS starter,
  DROP COLUMN IF EXISTS wild,
  DROP COLUMN IF EXISTS archetype,
  DROP COLUMN IF EXISTS stage,
  DROP COLUMN IF EXISTS dex;
-- Restoring the old rule would reject rows with a holding-period evolution, so clear them first.
UPDATE creature_definitions SET evolves_to = NULL, evolve_level = NULL
 WHERE (evolves_to IS NULL) <> (evolve_level IS NULL);
ALTER TABLE creature_definitions
  ADD CONSTRAINT creature_definitions_check CHECK ((evolves_to IS NULL) = (evolve_level IS NULL));
