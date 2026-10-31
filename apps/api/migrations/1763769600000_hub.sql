-- Up Migration
-- The hub (town). Chat is kept for moderation only, and only for 30 days (retention job).
-- Players chat within their age group: adults with adults, under-18s with under-18s.
CREATE TABLE hub_chat (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  age_group text NOT NULL CHECK (age_group IN ('adult', 'minor')),
  room text NOT NULL,
  body text NOT NULL,
  hidden_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hub_chat_created ON hub_chat (created_at);
CREATE INDEX hub_chat_user ON hub_chat (user_id, created_at);

CREATE TABLE hub_reports (
  id bigserial PRIMARY KEY,
  reporter_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  reported_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  message_id bigint REFERENCES hub_chat (id) ON DELETE SET NULL,
  reason text NOT NULL CHECK (reason IN ('harassment', 'spam', 'inappropriate', 'personal_info', 'other')),
  -- a copy of the message, so the report survives the chat's retention
  body text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reporter_id, message_id)
);
CREATE INDEX hub_reports_open ON hub_reports (status, created_at);

CREATE TABLE hub_blocks (
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, blocked_id),
  CHECK (user_id <> blocked_id)
);

ALTER TABLE players ADD COLUMN chat_muted_until timestamptz;
-- the creature that follows the player around the town (one of their own)
ALTER TABLE players ADD COLUMN companion_id uuid REFERENCES creature_instances (id) ON DELETE SET NULL;

-- Down Migration
ALTER TABLE players DROP COLUMN IF EXISTS companion_id;
ALTER TABLE players DROP COLUMN IF EXISTS chat_muted_until;
DROP TABLE IF EXISTS hub_blocks;
DROP TABLE IF EXISTS hub_reports;
DROP TABLE IF EXISTS hub_chat;
