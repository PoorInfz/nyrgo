-- Up Migration
-- Phase 3: a creature can leave for a player's NEAR wallet as an NFT (token id = creature id).
-- The NFT is the creature: in the game it belongs to whoever holds the token, through their
-- linked account. Progress (level, XP, HP) stays in the game and travels with the creature.
ALTER TABLE creature_instances
  ADD COLUMN onchain_status text CHECK (onchain_status IN ('minting', 'minted')),
  -- the NEAR account holding the token, as last read from the chain
  ADD COLUMN onchain_owner text,
  ADD COLUMN minted_at timestamptz,
  ADD COLUMN mint_tx text,
  ADD COLUMN onchain_checked_at timestamptz;
CREATE INDEX creature_instances_onchain_owner_idx ON creature_instances (onchain_owner)
  WHERE onchain_owner IS NOT NULL;

-- Down Migration
DROP INDEX IF EXISTS creature_instances_onchain_owner_idx;
ALTER TABLE creature_instances
  DROP COLUMN IF EXISTS onchain_checked_at,
  DROP COLUMN IF EXISTS mint_tx,
  DROP COLUMN IF EXISTS minted_at,
  DROP COLUMN IF EXISTS onchain_owner,
  DROP COLUMN IF EXISTS onchain_status;
