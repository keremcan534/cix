-- A server room's look, set by its owner (rooms.mjs POST /api/rooms/update) and seen by everyone in it: the cover
-- (one of the app's room backgrounds, by id: catalog.mjs ROOM_COVERS), the theme (catalog.mjs ROOM_THEMES) and
-- whether gift effects play in the room at all.
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS cover_id text CHECK (cover_id ~ '^[a-z0-9-]{1,20}$');
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS theme text NOT NULL DEFAULT 'chat' CHECK (theme ~ '^[a-z]{1,20}$');
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS gift_effects boolean NOT NULL DEFAULT true;
