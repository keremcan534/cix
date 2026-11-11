-- Following a room (room-follow.mjs). A room that closes and opens again is a new room id (one open room per owner),
-- so a follow is kept on the room's account, its owner, like the follower invite's daily limit (045): it survives the
-- room closing, and the room that account opens next is the followed one.
-- Only what the feature needs is kept, for as long as it needs it (UK GDPR):
--  * a follow (who follows which room account, since when) stays until it is taken back, a block comes between the
--    two, or either account is erased (social.mjs eraseAccount);
--  * a "room opened" notice is one row per send (not one per follower): it is the 6-hour limit and what each
--    follower's phone turns into a notice; rows older than 8 days are pruned.
-- Safe to run again.
CREATE TABLE IF NOT EXISTS room_follows (
  -- The room's account: the owner of the followed room.
  owner_id   uuid NOT NULL REFERENCES users(id),
  user_id    uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, user_id),
  CHECK (owner_id <> user_id)
);
-- The rooms I follow, newest first (Odalarım).
CREATE INDEX IF NOT EXISTS room_follows_user ON room_follows (user_id, created_at DESC);
-- An account's last room, for a followed room that is closed now (an open one has rooms_one_open_per_owner).
CREATE INDEX IF NOT EXISTS rooms_owner_created ON rooms (owner, created_at DESC);

CREATE TABLE IF NOT EXISTS room_open_notices (
  id         bigserial PRIMARY KEY,
  owner_id   uuid NOT NULL REFERENCES users(id),
  room_id    uuid NOT NULL REFERENCES rooms(id),
  -- How many followers it went to.
  recipients int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS room_open_notices_owner ON room_open_notices (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS room_open_notices_time ON room_open_notices (created_at);
