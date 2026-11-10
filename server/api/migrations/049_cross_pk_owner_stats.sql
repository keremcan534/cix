-- Odalar arası PK (pk-cross.mjs): two server rooms against each other. The owner or an admin of the red room
-- invites the blue room; the blue room's owner or an admin accepts or declines before invite_expires_at. Once
-- accepted it runs like Oda içi PK: a short countdown (start_at), then gifts paid in either room until end_at
-- score their coins for that room, once per gift_events row. Points never move money and there is no reward.
-- 'invite' and 'active' (countdown included) hold both rooms: one PK at a time per room. An invite that wasn't
-- answered in time is closed as 'expired', a PK whose end_at passed as 'done', and an open one whose room closed
-- as 'cancelled' (end_reason 'room_closed'), the next time either room's PK is read.
-- Retention: the rows are the two rooms' match record, like room_pks (the gifts themselves are gift_events).
-- Account deletion clears who invited, answered or ended (eraseAccount). Safe to run again.
CREATE TABLE IF NOT EXISTS room_cross_pks (
  id                bigserial PRIMARY KEY,
  red_room          uuid NOT NULL REFERENCES rooms(id),
  blue_room         uuid NOT NULL REFERENCES rooms(id),
  status            text NOT NULL DEFAULT 'invite' CHECK (status IN ('invite', 'active', 'done', 'cancelled', 'declined', 'expired')),
  duration_min      int NOT NULL CHECK (duration_min IN (15, 30, 60, 120)),
  invited_by        uuid REFERENCES users(id),
  ref               text NOT NULL,
  invite_expires_at timestamptz NOT NULL,
  answered_by       uuid REFERENCES users(id),
  answered_at       timestamptz,
  start_at          timestamptz,
  end_at            timestamptz,
  -- Ended early: by whom, from which room, and why ('staff': ended or withdrawn; 'room_closed').
  ended_by          uuid REFERENCES users(id),
  ended_room        uuid REFERENCES rooms(id),
  end_reason        text CHECK (end_reason IN ('staff', 'room_closed')),
  ended_at          timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (red_room <> blue_room)
);
CREATE UNIQUE INDEX IF NOT EXISTS room_cross_pks_ref ON room_cross_pks (invited_by, ref);
-- A room is on one side of at most one open PK (the other side is checked with both rooms' rows locked).
CREATE UNIQUE INDEX IF NOT EXISTS room_cross_pks_red_open ON room_cross_pks (red_room) WHERE status IN ('invite', 'active');
CREATE UNIQUE INDEX IF NOT EXISTS room_cross_pks_blue_open ON room_cross_pks (blue_room) WHERE status IN ('invite', 'active');
CREATE INDEX IF NOT EXISTS room_cross_pks_red ON room_cross_pks (red_room, id DESC);
CREATE INDEX IF NOT EXISTS room_cross_pks_blue ON room_cross_pks (blue_room, id DESC);

CREATE TABLE IF NOT EXISTS room_cross_pk_gifts (
  pk_id      bigint NOT NULL REFERENCES room_cross_pks(id),
  gift_event bigint NOT NULL REFERENCES gift_events(id),
  side       text NOT NULL CHECK (side IN ('red', 'blue')),
  sender     uuid NOT NULL REFERENCES users(id),
  recipient  uuid NOT NULL REFERENCES users(id),
  points     bigint NOT NULL CHECK (points > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pk_id, gift_event)
);

-- Oda Sahibi Merkezi (room-owner.mjs) reads one room's visits of the last hours.
CREATE INDEX IF NOT EXISTS presence_log_room ON presence_log (room, left_at);
