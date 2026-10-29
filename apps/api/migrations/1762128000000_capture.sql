-- Up Migration
-- Milestone 6: wild spawns, encounters, captures, collection and the personal Dex.

-- One row per cell and window once its spawns have been generated, so concurrent requests
-- generate each cell exactly once.
CREATE TABLE spawn_generations (
  h3_r9         h3index NOT NULL,
  window_start  timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (h3_r9, window_start)
);
CREATE INDEX spawns_expiry_idx ON spawns (expires_at);

-- A player facing one spawn. At most one per player and spawn; a caught or fled creature
-- stays gone for that player.
CREATE TABLE encounters (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  spawn_id    uuid NOT NULL REFERENCES spawns ON DELETE CASCADE,
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'caught', 'fled')),
  attempts    smallint NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  started_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  ended_at    timestamptz,
  UNIQUE (user_id, spawn_id)
);
CREATE INDEX encounters_spawn_idx ON encounters (spawn_id);

-- Capture attempts age out with their spawn (see retention).
ALTER TABLE capture_attempts DROP CONSTRAINT capture_attempts_spawn_id_fkey,
  ADD CONSTRAINT capture_attempts_spawn_id_fkey FOREIGN KEY (spawn_id) REFERENCES spawns ON DELETE CASCADE,
  ADD COLUMN encounter_id uuid REFERENCES encounters ON DELETE SET NULL;

-- The personal Dex: which creatures a player has seen (opened an encounter with) and caught.
CREATE TABLE dex_entries (
  user_id        uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  definition_id  text NOT NULL REFERENCES creature_definitions,
  seen_at        timestamptz NOT NULL DEFAULT now(),
  caught_at      timestamptz,
  caught_count   int NOT NULL DEFAULT 0 CHECK (caught_count >= 0),
  PRIMARY KEY (user_id, definition_id)
);

-- Collection: one starter per player; deleting an account deletes its creatures.
CREATE UNIQUE INDEX creature_instances_one_starter ON creature_instances (owner_id)
  WHERE acquired_via = 'starter';
ALTER TABLE creature_instances DROP CONSTRAINT creature_instances_owner_id_fkey,
  ADD CONSTRAINT creature_instances_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES users ON DELETE CASCADE;

-- New players get a starter kit once; existing players receive it on their next request.
ALTER TABLE players ADD COLUMN kit_granted_at timestamptz;

-- Down Migration
ALTER TABLE players DROP COLUMN IF EXISTS kit_granted_at;
ALTER TABLE creature_instances DROP CONSTRAINT creature_instances_owner_id_fkey,
  ADD CONSTRAINT creature_instances_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES users;
DROP INDEX IF EXISTS creature_instances_one_starter;
DROP TABLE IF EXISTS dex_entries;
ALTER TABLE capture_attempts DROP COLUMN IF EXISTS encounter_id,
  DROP CONSTRAINT capture_attempts_spawn_id_fkey,
  ADD CONSTRAINT capture_attempts_spawn_id_fkey FOREIGN KEY (spawn_id) REFERENCES spawns;
DROP TABLE IF EXISTS encounters;
DROP INDEX IF EXISTS spawns_expiry_idx;
DROP TABLE IF EXISTS spawn_generations;
