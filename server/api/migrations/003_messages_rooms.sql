-- Direct messages and rooms.

CREATE TABLE messages (
  id         bigserial PRIMARY KEY,
  sender     uuid NOT NULL REFERENCES users(id),
  recipient  uuid NOT NULL REFERENCES users(id),
  body       text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  -- Client request id: a resent message (retry, double tap) is stored once.
  ref        text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at    timestamptz,
  UNIQUE (sender, ref),
  CHECK (sender <> recipient)
);
-- One conversation = the unordered pair; newest first.
CREATE INDEX messages_pair ON messages (LEAST(sender, recipient), GREATEST(sender, recipient), id DESC);
CREATE INDEX messages_unread ON messages (recipient) WHERE read_at IS NULL;

CREATE TABLE rooms (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner         uuid NOT NULL REFERENCES users(id),
  title         text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 40),
  announcement  text NOT NULL DEFAULT '' CHECK (char_length(announcement) <= 200),
  room_type     text NOT NULL DEFAULT 'free' CHECK (room_type IN ('free', 'stage', 'qa', 'music', 'event', 'private')),
  -- Private rooms: sha256 of the password; the voice token is only issued with the right password.
  password_hash text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  closed_at     timestamptz
);
-- Everyone has at most one open room of their own.
CREATE UNIQUE INDEX rooms_one_open_per_owner ON rooms(owner) WHERE closed_at IS NULL;

CREATE TABLE room_admins (
  room_id uuid NOT NULL REFERENCES rooms(id),
  user_id uuid NOT NULL REFERENCES users(id),
  PRIMARY KEY (room_id, user_id)
);

-- Kicks and blacklist: no voice token for this room until `until` (NULL = for good).
CREATE TABLE room_bans (
  room_id    uuid NOT NULL REFERENCES rooms(id),
  user_id    uuid NOT NULL REFERENCES users(id),
  until      timestamptz,
  by_user    uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, user_id)
);
