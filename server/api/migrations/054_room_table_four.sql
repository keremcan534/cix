-- Oda oyunları (room-games.mjs): Dört Taş (room-games/four.mjs) joins the games a room's table may hold. The list is
-- 050's with 'four' added.
ALTER TABLE room_tables DROP CONSTRAINT IF EXISTS room_tables_game_check;
ALTER TABLE room_tables ADD CONSTRAINT room_tables_game_check CHECK (game IN ('ludo', 'cards', 'xox', 'four'));
