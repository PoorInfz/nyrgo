-- Up Migration
-- Arena seasons (one per month; ratings carry halfway back to 1000) and weekly tournaments.

ALTER TABLE players ADD COLUMN arena_season text NOT NULL DEFAULT '';
-- everyone who played so far played in the first season
UPDATE players SET arena_season = '2026-10' WHERE arena_wins + arena_losses > 0;

CREATE TABLE arena_season_results (
  season text NOT NULL,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  adult boolean NOT NULL,
  rating integer NOT NULL,
  wins integer NOT NULL,
  losses integer NOT NULL,
  PRIMARY KEY (season, user_id)
);
CREATE INDEX arena_season_results_board ON arena_season_results (season, adult, rating DESC);

CREATE TABLE hub_tournaments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  adult boolean NOT NULL,
  starts_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'cancelled')),
  -- rounds of matches: [[{ a, b, winner, turns }]], user ids; the final keeps its whole fight
  bracket jsonb,
  seed text,
  finished_at timestamptz
);
-- one open tournament per age group at a time
CREATE UNIQUE INDEX hub_tournaments_one_open ON hub_tournaments (adult) WHERE status = 'open';

CREATE TABLE hub_tournament_entries (
  tournament_id uuid NOT NULL REFERENCES hub_tournaments (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  creature_id uuid NOT NULL REFERENCES creature_instances (id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  place integer,
  prize integer NOT NULL DEFAULT 0,
  PRIMARY KEY (tournament_id, user_id)
);
CREATE INDEX hub_tournament_entries_user ON hub_tournament_entries (user_id);

-- Down Migration
DROP TABLE IF EXISTS hub_tournament_entries;
DROP TABLE IF EXISTS hub_tournaments;
DROP TABLE IF EXISTS arena_season_results;
ALTER TABLE players DROP COLUMN IF EXISTS arena_season;
