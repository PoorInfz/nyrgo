-- Up Migration
-- Creature NFTs have a limited supply per species (fixed on chain); each one is an edition.
-- The snapshot is what the token shows forever: species, level and IVs when it left the game.
ALTER TABLE creature_instances
  ADD COLUMN nft_edition int CHECK (nft_edition IS NULL OR nft_edition > 0),
  ADD COLUMN nft_supply int CHECK (nft_supply IS NULL OR nft_supply > 0),
  ADD COLUMN nft_snapshot jsonb;

-- Down Migration
ALTER TABLE creature_instances
  DROP COLUMN IF EXISTS nft_snapshot,
  DROP COLUMN IF EXISTS nft_supply,
  DROP COLUMN IF EXISTS nft_edition;
