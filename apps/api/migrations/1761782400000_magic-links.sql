-- Up Migration
-- Email magic links for login and for upgrading a guest account. Only token hashes are stored.

CREATE TABLE magic_links (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       citext NOT NULL,
  purpose     text NOT NULL CHECK (purpose IN ('login', 'upgrade')),
  user_id     uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  token_hash  bytea NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  CHECK (expires_at > created_at)
);
CREATE INDEX magic_links_email_idx ON magic_links (email, created_at);

ALTER TABLE sessions ADD COLUMN last_seen_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX sessions_expiry_idx ON sessions (expires_at);

-- Down Migration
DROP INDEX IF EXISTS sessions_expiry_idx;
ALTER TABLE sessions DROP COLUMN IF EXISTS last_seen_at;
DROP TABLE IF EXISTS magic_links;
