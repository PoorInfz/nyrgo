-- Up Migration
-- The NYRGO token was dropped: rewards are paid in NEAR from the game's trading fees instead.
DROP TABLE IF EXISTS token_claims;
DROP TABLE IF EXISTS token_ledger;

-- Down Migration
-- (the token is not coming back; nothing to restore)
