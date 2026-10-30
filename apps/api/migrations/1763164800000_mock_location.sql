-- Up Migration
-- The Android app reports fixes Android marks as mocked; they pause interactions like a jump.
ALTER TABLE player_movement DROP CONSTRAINT IF EXISTS player_movement_lock_reason_check;
ALTER TABLE player_movement
  ADD CONSTRAINT player_movement_lock_reason_check CHECK (lock_reason IN ('teleport', 'mock_location'));

-- Down Migration
UPDATE player_movement SET lock_reason = 'teleport' WHERE lock_reason = 'mock_location';
ALTER TABLE player_movement DROP CONSTRAINT IF EXISTS player_movement_lock_reason_check;
ALTER TABLE player_movement ADD CONSTRAINT player_movement_lock_reason_check CHECK (lock_reason IN ('teleport'));
