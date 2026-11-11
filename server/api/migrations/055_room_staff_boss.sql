-- Güncelleme 4, madde 1: a room needs its staff (room-autoclose.mjs). no_staff_since: when the sweep first saw the
-- room's voice room without its owner and every admin (null: staff in it, or not known); paused_at: the room rests
-- after that many minutes, not live until its owner or an admin comes back. The room, its settings, admins and
-- members stay as they are (a closed room, closed_at, never opens again).
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS no_staff_since timestamptz;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS paused_at timestamptz;

-- Güncelleme 4, madde 13: Patron koltuğu (boss-seat.mjs). The holder's sitting: since when, until when (null: no
-- end, the Davet mode) and every coin the holder sent in the room during it. The old rule's holder (the top gifter of
-- the last 24 hours) had no sitting: the seat starts empty.
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS boss_since timestamptz;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS boss_until timestamptz;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS boss_spent bigint NOT NULL DEFAULT 0;
UPDATE rooms SET boss_id = NULL WHERE boss_id IS NOT NULL;

-- The sweeps: sittings that end, rooms whose staff count runs.
CREATE INDEX IF NOT EXISTS rooms_boss_until ON rooms (boss_until) WHERE boss_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS rooms_no_staff ON rooms (no_staff_since) WHERE no_staff_since IS NOT NULL AND closed_at IS NULL AND paused_at IS NULL;
