-- The room's music as a playlist (güncelleme 4, item 16; music.mjs):
--  * room_music_queue keeps its rows after they play: it is the room's list, in `pos` order. "Öne al" moves a row
--    right after the one playing, so the order is no longer the order of adding;
--  * rooms.music_current is the row playing now (null: nothing plays; the list may still hold rows), from
--    music_started_at as before. Previous and next move it along the list;
--  * rooms.music_repeat: off (the list plays once), one (the playing track again and again) or all (the list
--    again from the top);
--  * music_tracks.artist: the performer, when the file's name gave one ("Sanatçı - Parça").
ALTER TABLE music_tracks ADD COLUMN artist text;

ALTER TABLE room_music_queue ADD COLUMN pos bigint;
UPDATE room_music_queue SET pos = id;
ALTER TABLE room_music_queue ALTER COLUMN pos SET NOT NULL;

ALTER TABLE rooms ADD COLUMN music_current bigint;
ALTER TABLE rooms ADD COLUMN music_repeat text NOT NULL DEFAULT 'off' CHECK (music_repeat IN ('off', 'one', 'all'));
-- What played before this: the first row of the queue, from music_started_at.
UPDATE rooms r SET music_current = (SELECT min(q.id) FROM room_music_queue q WHERE q.room_id = r.id) WHERE r.music_started_at IS NOT NULL;
