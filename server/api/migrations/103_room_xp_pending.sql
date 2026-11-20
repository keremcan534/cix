-- Room XP waiting to reach its owner (room-xp-add.mjs). A gift in an open server room no longer writes the owner's
-- users.room_xp inside its own transaction: that row, taken out of the accounts' id order, deadlocked with the owner's
-- own money (a Şanslı send in the room with the owner's gift to one of its recipients), and locked up front it made a
-- room's gifts wait for each other from start to end. The gift writes its coins here instead (one row per gift_events
-- row, the room's owner at that moment) and they are added to users.room_xp right after it commits, in a transaction
-- of their own that deletes the row (so each is added once); a row a crash left behind is added by the sweep.
-- No foreign keys: a key check on the owner would wait for the owner's row again. A row lives for milliseconds; the
-- owner's room_xp is in their data copy.
CREATE TABLE IF NOT EXISTS room_xp_pending (
  event_id bigint PRIMARY KEY,
  owner uuid NOT NULL,
  xp bigint NOT NULL CHECK (xp > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS room_xp_pending_owner ON room_xp_pending (owner);
CREATE INDEX IF NOT EXISTS room_xp_pending_age ON room_xp_pending (created_at);
