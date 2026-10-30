-- Profiles, follows, blocks, reports, roles and account deletion.
-- A deleted account keeps its id and its ledger rows (financial records are retained), but every personal
-- field is cleared and it can no longer sign in (DELETE /api/me).

ALTER TABLE users
  ADD COLUMN username     text UNIQUE CHECK (username ~ '^[a-z0-9_.]{3,20}$'),
  ADD COLUMN gender       text CHECK (gender IN ('Kadın', 'Erkek')),
  -- 18+ is checked by the API on every change (a CHECK can't compare with today's date).
  ADD COLUMN birth_date   date,
  ADD COLUMN city         text CHECK (char_length(city) <= 40),
  ADD COLUMN bio          text NOT NULL DEFAULT '' CHECK (char_length(bio) <= 160),
  ADD COLUMN interests    text[] NOT NULL DEFAULT '{}' CHECK (cardinality(interests) <= 5),
  ADD COLUMN avatar_url   text CHECK (char_length(avatar_url) <= 500),
  -- Moderation: staff roles, and a platform ban that blocks sign-in and every call until it ends.
  ADD COLUMN role         text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'moderator', 'admin')),
  ADD COLUMN banned_until timestamptz,
  ADD COLUMN deleted_at   timestamptz;

CREATE TABLE follows (
  follower   uuid NOT NULL REFERENCES users(id),
  followee   uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower, followee),
  CHECK (follower <> followee)
);
CREATE INDEX follows_followee ON follows(followee);

CREATE TABLE blocks (
  blocker    uuid NOT NULL REFERENCES users(id),
  blocked    uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker, blocked),
  CHECK (blocker <> blocked)
);
CREATE INDEX blocks_blocked ON blocks(blocked);

-- User reports (Apple 1.2, Play UGC): every report lands in a queue that staff work through.
CREATE TABLE reports (
  id          bigserial PRIMARY KEY,
  reporter    uuid NOT NULL REFERENCES users(id),
  target_type text NOT NULL CHECK (target_type IN ('user', 'room', 'message', 'moment')),
  target_id   text NOT NULL CHECK (char_length(target_id) <= 64),
  reason      text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 60),
  note        text NOT NULL DEFAULT '' CHECK (char_length(note) <= 500),
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'actioned', 'dismissed')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  handled_by  uuid REFERENCES users(id),
  handled_at  timestamptz,
  -- The same person reporting the same thing twice counts once.
  UNIQUE (reporter, target_type, target_id)
);
CREATE INDEX reports_open ON reports(created_at) WHERE status = 'open';
