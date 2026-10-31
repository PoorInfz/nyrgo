-- Up Migration
-- Training in the gym and battles in the arena. Every activity is kept (with its fight) for the
-- player's history and for limits: per day, and the town's daily XP.
ALTER TABLE players ADD COLUMN arena_rating integer NOT NULL DEFAULT 1000;
ALTER TABLE players ADD COLUMN arena_wins integer NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN arena_losses integer NOT NULL DEFAULT 0;
-- the creature others fight when they challenge this player in the arena
ALTER TABLE players ADD COLUMN arena_defender uuid REFERENCES creature_instances (id) ON DELETE SET NULL;
CREATE INDEX players_arena_rating ON players (arena_rating);

CREATE TABLE hub_activities (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('training', 'arena_ranked', 'arena_practice')),
  creature_id uuid REFERENCES creature_instances (id) ON DELETE SET NULL,
  creature_def text NOT NULL,
  creature_level integer NOT NULL,
  tier integer,
  opponent_user uuid REFERENCES users (id) ON DELETE SET NULL,
  opponent_name text,
  opponent_def text NOT NULL,
  opponent_level integer NOT NULL,
  won boolean,
  rating_before integer,
  rating_after integer,
  hub_xp integer NOT NULL DEFAULT 0,
  creature_xp integer NOT NULL DEFAULT 0,
  fight jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hub_activities_user ON hub_activities (user_id, created_at);
CREATE INDEX hub_activities_opponent ON hub_activities (opponent_user, created_at);

-- Down Migration
DROP TABLE IF EXISTS hub_activities;
DROP INDEX IF EXISTS players_arena_rating;
ALTER TABLE players DROP COLUMN IF EXISTS arena_defender;
ALTER TABLE players DROP COLUMN IF EXISTS arena_losses;
ALTER TABLE players DROP COLUMN IF EXISTS arena_wins;
ALTER TABLE players DROP COLUMN IF EXISTS arena_rating;
