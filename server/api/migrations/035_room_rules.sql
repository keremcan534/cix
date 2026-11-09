-- A server room's rules (room-rules.mjs: mic permission, Dümen koltuğu, membership, people limit, privacy, bot, slow
-- mode, forbidden words), its members and its Dümen koltuğu holder, so every phone in the room follows the same ones.
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS rules jsonb NOT NULL DEFAULT '{}'::jsonb;
-- Dümen koltuğu: the room's top gifter of the last 24 hours (rooms.mjs refreshBoss), null when nobody qualifies.
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS boss_id uuid REFERENCES users(id);

-- Room members: 'member' (joined, or approved) or 'pending' (asked in an 'apply' room). seen_at: their last voice
-- token for the room, for automatic removal (rules.autoRemoveDays).
CREATE TABLE IF NOT EXISTS room_members (
  room_id uuid NOT NULL REFERENCES rooms(id),
  user_id uuid NOT NULL REFERENCES users(id),
  status text NOT NULL CHECK (status IN ('member', 'pending')),
  created_at timestamptz NOT NULL DEFAULT now(),
  seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);
CREATE INDEX IF NOT EXISTS room_members_user ON room_members (user_id);

-- The room's gifts of the last day (Dümen koltuğu).
CREATE INDEX IF NOT EXISTS gift_events_room_time ON gift_events (room, created_at) WHERE room IS NOT NULL;
