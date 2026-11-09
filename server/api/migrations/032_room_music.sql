-- DJ and the room's music (music.mjs, rooms.mjs):
--  * room_djs: people the owner lets play music in the room and do nothing else there (no mics, no kicks, no
--    mutes). 3 at Lv.1–5, more as the room's level rises, at the rate the admins rise (music.mjs DJ_LIMITS);
--  * music_tracks: what someone added to their library from their phone. The file is in the photo storage
--    (media.mjs kind music, under music/<owner>/); a removed track keeps its row for the record;
--  * room_music_queue: what plays in a room, first in first played. The room keeps when the first one started
--    (music_started_at, pauses taken out) and, while paused, since when (music_paused_at). A track that has played
--    through leaves the queue the next time the room's music is read, so no phone has to say it ended.
CREATE TABLE room_djs (
  room_id    uuid NOT NULL REFERENCES rooms(id),
  user_id    uuid NOT NULL REFERENCES users(id),
  by_user    uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);
CREATE INDEX room_djs_user ON room_djs (user_id);

CREATE TABLE music_tracks (
  id         bigserial PRIMARY KEY,
  owner      uuid NOT NULL REFERENCES users(id),
  title      text NOT NULL,
  url        text NOT NULL,
  seconds    int NOT NULL CHECK (seconds BETWEEN 5 AND 1200),
  size       int NOT NULL CHECK (size > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz
);
CREATE INDEX music_tracks_owner ON music_tracks (owner, id DESC) WHERE removed_at IS NULL;

CREATE TABLE room_music_queue (
  id         bigserial PRIMARY KEY,
  room_id    uuid NOT NULL REFERENCES rooms(id),
  track_id   bigint NOT NULL REFERENCES music_tracks(id),
  added_by   uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX room_music_queue_room ON room_music_queue (room_id, id);
CREATE INDEX room_music_queue_track ON room_music_queue (track_id);

ALTER TABLE rooms ADD COLUMN music_started_at timestamptz;
ALTER TABLE rooms ADD COLUMN music_paused_at timestamptz;
