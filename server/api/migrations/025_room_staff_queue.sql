-- The room's settings and staff, wave 2 (rooms.mjs):
--  * locked mics are kept on the room: before, they lived only in the LiveKit room's metadata and were gone once
--    the room emptied. The metadata is now written from here (rooms.mjs pushRoomMeta), with the layout, the mic
--    count and the mic queue, so every phone in the room sees a change as soon as it is made;
--  * the mic queue (mic_queue on): members ask for a mic, the owner or an admin lets them up (room_mic_queue);
--  * Süper Yönetici (room_admins.super): an admin the owner trusts with the room's name and bulletin, above the
--    other admins. Owner > Süper Yönetici > Yönetici > everyone else: nobody acts on their own rank or higher.
ALTER TABLE rooms ADD COLUMN locked_seats int[] NOT NULL DEFAULT '{}';
ALTER TABLE rooms ADD COLUMN mic_queue boolean NOT NULL DEFAULT false;
ALTER TABLE room_admins ADD COLUMN super boolean NOT NULL DEFAULT false;

CREATE TABLE room_mic_queue (
  room_id    uuid NOT NULL REFERENCES rooms(id),
  user_id    uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);
