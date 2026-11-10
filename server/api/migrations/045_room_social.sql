-- Room social features (room-social.mjs): mic invites, the room poll and the owner's once-a-day invite to their
-- followers. Only what each feature needs is kept, for as long as it needs it (UK GDPR):
--  * a mic invite lives 30 seconds; rows older than an hour are pruned (the inviter's phone only needs the answer);
--  * a poll and its votes are pruned 7 days after the poll started;
--  * a follower invite is one row per send (not one per follower): it is the 24-hour limit and what each follower's
--    phone turns into a notice; rows older than 8 days are pruned.
-- An erased account's rows go with it (social.mjs eraseAccount). Safe to run again.
CREATE TABLE IF NOT EXISTS room_mic_invites (
  id          bigserial PRIMARY KEY,
  room_id     uuid NOT NULL REFERENCES rooms(id),
  from_user   uuid NOT NULL REFERENCES users(id),
  to_user     uuid NOT NULL REFERENCES users(id),
  -- The mic the invite is for (1–99); null: any free mic, the one the invited phone picks on accepting.
  seat        int CHECK (seat BETWEEN 1 AND 99),
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'failed', 'cancelled')),
  note        text NOT NULL DEFAULT '' CHECK (char_length(note) <= 80),
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  answered_at timestamptz,
  CHECK (from_user <> to_user)
);
-- One waiting invite per person and room.
CREATE UNIQUE INDEX IF NOT EXISTS room_mic_invites_one_pending ON room_mic_invites (room_id, to_user) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS room_mic_invites_room ON room_mic_invites (room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS room_mic_invites_time ON room_mic_invites (created_at);

CREATE TABLE IF NOT EXISTS room_polls (
  id         bigserial PRIMARY KEY,
  room_id    uuid NOT NULL REFERENCES rooms(id),
  creator    uuid NOT NULL REFERENCES users(id),
  question   text NOT NULL CHECK (char_length(question) BETWEEN 4 AND 120),
  options    text[] NOT NULL CHECK (cardinality(options) BETWEEN 2 AND 4),
  -- live: everyone sees the results as they come; otherwise only after voting or once it ended.
  live       boolean NOT NULL DEFAULT true,
  ends_at    timestamptz NOT NULL,
  closed_at  timestamptz,
  closed_by  uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
-- One open poll per room (a poll whose time ran out is closed before a new one starts).
CREATE UNIQUE INDEX IF NOT EXISTS room_polls_one_open ON room_polls (room_id) WHERE closed_at IS NULL;
CREATE INDEX IF NOT EXISTS room_polls_room ON room_polls (room_id, id DESC);
CREATE INDEX IF NOT EXISTS room_polls_time ON room_polls (created_at);
CREATE TABLE IF NOT EXISTS room_poll_votes (
  poll_id    bigint NOT NULL REFERENCES room_polls(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES users(id),
  option     smallint NOT NULL CHECK (option BETWEEN 0 AND 3),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- One vote per person and poll.
  PRIMARY KEY (poll_id, user_id)
);

CREATE TABLE IF NOT EXISTS room_follower_invites (
  id         bigserial PRIMARY KEY,
  -- The room's account: its followers are invited, and the 24-hour limit is theirs (a closed and reopened room
  -- is a new room id, the limit stays).
  owner_id   uuid NOT NULL REFERENCES users(id),
  room_id    uuid NOT NULL REFERENCES rooms(id),
  sent_by    uuid NOT NULL REFERENCES users(id),
  -- How many followers it went to (the count shown to the sender).
  recipients int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS room_follower_invites_owner ON room_follower_invites (owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS room_follower_invites_time ON room_follower_invites (created_at);
