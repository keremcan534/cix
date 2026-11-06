-- Oda seviyesi ve mikrofon düzeni sunucuda (rooms.mjs, gifts.mjs, admin.mjs).
-- The owner's room XP: coins of gifts sent in their open rooms (the level follows rooms.mjs ROOM_XP_THRESHOLDS,
-- the same steps as the app). On the owner, not the room, so a room closed and opened again keeps its level.
ALTER TABLE users ADD COLUMN IF NOT EXISTS room_xp bigint NOT NULL DEFAULT 0 CHECK (room_xp >= 0);

-- What every phone in the room draws: the classic grid's mic count (null = as many as the level gives) and the
-- stage layout (null = the classic grid). Set by the owner or a room admin (POST /api/rooms/update).
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS mic_count int CHECK (mic_count BETWEEN 1 AND 15);
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS layout_id text CHECK (length(layout_id) <= 40);
