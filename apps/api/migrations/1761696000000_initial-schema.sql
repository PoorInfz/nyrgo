-- Up Migration
-- nyrgo Phase 1 schema (approved 2026-10-29). Wallet, claims, NFT and marketplace tables
-- arrive in Phase 3/5 migrations.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS h3;
CREATE EXTENSION IF NOT EXISTS h3_postgis CASCADE;
CREATE EXTENSION IF NOT EXISTS citext;

-- ---------------------------------------------------------------- accounts
CREATE TABLE users (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        text NOT NULL CHECK (kind IN ('guest', 'registered')),
  email       citext UNIQUE,
  age_band    text NOT NULL CHECK (age_band IN ('13-15', '16-17', '18+')),
  region      char(2),
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
  risk_level  smallint NOT NULL DEFAULT 0 CHECK (risk_level BETWEEN 0 AND 100),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  -- GDPR erasure anonymizes the row (status 'deleted', email NULL) instead of deleting it,
  -- so append-only ledgers keep only a pseudonymous id.
  CHECK (kind = 'guest' OR email IS NOT NULL OR status = 'deleted')
);

CREATE TABLE sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  token_hash  bytea NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

CREATE TABLE players (
  user_id       uuid PRIMARY KEY REFERENCES users ON DELETE CASCADE,
  display_name  text NOT NULL CHECK (char_length(display_name) BETWEEN 3 AND 24),
  level         int NOT NULL DEFAULT 1 CHECK (level >= 1),
  xp            bigint NOT NULL DEFAULT 0 CHECK (xp >= 0),
  gold          bigint NOT NULL DEFAULT 0 CHECK (gold >= 0),
  version       int NOT NULL DEFAULT 0,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- content
CREATE TABLE config_versions (
  id           serial PRIMARY KEY,
  scope        text NOT NULL,
  payload      jsonb NOT NULL,
  author_id    uuid,
  approved_by  uuid,
  active_from  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX config_versions_scope_idx ON config_versions (scope, active_from DESC);

CREATE TABLE creature_definitions (
  id                  text PRIMARY KEY,
  name                text NOT NULL UNIQUE,
  element             text NOT NULL CHECK (element IN
                        ('fire','water','nature','electric','shadow','light','earth','ice','wind','cosmic')),
  rarity              text NOT NULL CHECK (rarity IN
                        ('common','uncommon','rare','epic','legendary','mythic')),
  base_hp             int NOT NULL CHECK (base_hp > 0),
  base_atk            int NOT NULL CHECK (base_atk > 0),
  base_def            int NOT NULL CHECK (base_def > 0),
  base_spd            int NOT NULL CHECK (base_spd > 0),
  skills              text[] NOT NULL,
  passive             text,
  capture_difficulty  int NOT NULL CHECK (capture_difficulty BETWEEN 1 AND 100),
  biomes              text[] NOT NULL,
  evolves_to          text REFERENCES creature_definitions,
  evolve_level        int,
  evolve_cost         jsonb,
  model_asset         text,
  lore                text,
  config_version      int NOT NULL,
  CHECK ((evolves_to IS NULL) = (evolve_level IS NULL))
);

CREATE TABLE item_definitions (
  id              text PRIMARY KEY,
  kind            text NOT NULL,
  rarity          text NOT NULL,
  effects         jsonb NOT NULL,
  config_version  int NOT NULL
);

CREATE TABLE recipes (
  id              text PRIMARY KEY,
  inputs          jsonb NOT NULL,
  gold_cost       int NOT NULL CHECK (gold_cost >= 0),
  output_item     text NOT NULL REFERENCES item_definitions,
  unlock_level    int NOT NULL DEFAULT 1,
  config_version  int NOT NULL
);

-- ---------------------------------------------------------------- world
CREATE TABLE pois (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  osm_id        bigint UNIQUE,
  kind          text NOT NULL,
  name          text,
  geom          geography(Point, 4326) NOT NULL,
  h3_r9         h3index NOT NULL,
  hidden        boolean NOT NULL DEFAULT false,
  report_count  int NOT NULL DEFAULT 0
);
CREATE INDEX pois_geom_idx ON pois USING gist (geom);
CREATE INDEX pois_h3_idx ON pois (h3_r9);

CREATE TABLE exclusion_zones (
  id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind  text NOT NULL,
  source text NOT NULL DEFAULT 'osm',
  geom  geography(MultiPolygon, 4326) NOT NULL
);
CREATE INDEX exclusion_zones_geom_idx ON exclusion_zones USING gist (geom);

CREATE TABLE spawns (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  h3_r9          h3index NOT NULL,
  definition_id  text NOT NULL REFERENCES creature_definitions,
  level          int NOT NULL CHECK (level >= 1),
  geom           geography(Point, 4326) NOT NULL,
  seed           bigint NOT NULL,
  window_start   timestamptz NOT NULL,
  expires_at     timestamptz NOT NULL,
  UNIQUE (h3_r9, window_start, seed),
  CHECK (expires_at > window_start)
);
CREATE INDEX spawns_cell_idx ON spawns (h3_r9, expires_at);

-- ---------------------------------------------------------------- collection
CREATE TABLE creature_instances (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  definition_id  text NOT NULL REFERENCES creature_definitions,
  owner_id       uuid NOT NULL REFERENCES users,
  level          int NOT NULL CHECK (level >= 1),
  xp             bigint NOT NULL DEFAULT 0 CHECK (xp >= 0),
  ivs            jsonb NOT NULL,
  hp_current     int NOT NULL CHECK (hp_current >= 0),
  acquired_via   text NOT NULL,
  acquired_ref   uuid NOT NULL,
  acquired_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX creature_instances_owner_idx ON creature_instances (owner_id);

CREATE TABLE inventory (
  user_id  uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  item_id  text NOT NULL REFERENCES item_definitions,
  qty      int NOT NULL CHECK (qty >= 0),
  PRIMARY KEY (user_id, item_id)
);

-- ---------------------------------------------------------------- auditable actions
CREATE TABLE capture_attempts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users,
  spawn_id     uuid NOT NULL REFERENCES spawns,
  item_id      text NOT NULL REFERENCES item_definitions,
  skill_score  real,
  chance       real NOT NULL CHECK (chance BETWEEN 0 AND 1),
  roll         real NOT NULL CHECK (roll BETWEEN 0 AND 1),
  success      boolean NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
-- At most one successful capture per spawn and player; failed attempts may repeat.
CREATE UNIQUE INDEX capture_attempts_one_success ON capture_attempts (user_id, spawn_id) WHERE success;

CREATE TABLE battles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users,
  kind        text NOT NULL CHECK (kind IN ('wild', 'npc')),
  seed        bigint NOT NULL,
  turns       jsonb NOT NULL DEFAULT '[]',
  result      text CHECK (result IN ('win', 'loss', 'fled')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX battles_user_idx ON battles (user_id, created_at);

CREATE TABLE mission_progress (
  user_id       uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  mission_id    text NOT NULL,
  period_start  date NOT NULL,
  progress      int NOT NULL DEFAULT 0 CHECK (progress >= 0),
  completed_at  timestamptz,
  rewarded_at   timestamptz,
  PRIMARY KEY (user_id, mission_id, period_start)
);

-- ---------------------------------------------------------------- economy
CREATE TABLE gold_ledger (
  id          bigserial PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users,
  amount      bigint NOT NULL CHECK (amount <> 0),
  reason      text NOT NULL,
  ref_id      uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reason, ref_id)
);
CREATE INDEX gold_ledger_user_idx ON gold_ledger (user_id, created_at);

-- ---------------------------------------------------------------- anti-cheat and privacy
CREATE TABLE location_samples (
  id          bigserial PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  h3_r9       h3index NOT NULL,
  geom        geography(Point, 4326),
  accuracy_m  real,
  speed_ms    real,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX location_samples_user_idx ON location_samples (user_id, created_at);

CREATE TABLE risk_signals (
  id          bigserial PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  kind        text NOT NULL,
  score       smallint NOT NULL CHECK (score BETWEEN 0 AND 100),
  detail      jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX risk_signals_user_idx ON risk_signals (user_id, created_at);

-- ---------------------------------------------------------------- infrastructure
CREATE TABLE idempotency_keys (
  user_id       uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  key           text NOT NULL CHECK (char_length(key) BETWEEN 8 AND 128),
  endpoint      text NOT NULL,
  request_hash  bytea NOT NULL,
  status_code   int,
  response      jsonb,
  expires_at    timestamptz NOT NULL,
  PRIMARY KEY (user_id, key)
);
CREATE INDEX idempotency_keys_expiry_idx ON idempotency_keys (expires_at);

CREATE TABLE admin_audit_log (
  id          bigserial PRIMARY KEY,
  admin_id    uuid NOT NULL,
  role        text NOT NULL,
  action      text NOT NULL,
  before      jsonb,
  after       jsonb,
  reason      text NOT NULL CHECK (char_length(reason) > 0),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Append-only ledgers: refuse UPDATE and DELETE regardless of the connecting role.
CREATE FUNCTION forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END;
$$;
CREATE TRIGGER admin_audit_log_append_only BEFORE UPDATE OR DELETE ON admin_audit_log
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER gold_ledger_append_only BEFORE UPDATE OR DELETE ON gold_ledger
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- Down Migration
DROP TABLE IF EXISTS admin_audit_log, idempotency_keys, risk_signals, location_samples,
  gold_ledger, mission_progress, battles, capture_attempts, inventory, creature_instances,
  spawns, exclusion_zones, pois, recipes, item_definitions, creature_definitions,
  config_versions, players, sessions, users CASCADE;
DROP FUNCTION IF EXISTS forbid_mutation();
