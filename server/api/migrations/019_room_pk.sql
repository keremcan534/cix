-- Oda içi PK (pk.mjs): Normal PK (everyone on a mic at the start competes alone) and Takım PK (Red against Blue)
-- in one server room. The owner or a room admin starts it; who competes is fixed at the start. A gift paid in the
-- room while it runs (gifts.mjs, same transaction) scores its coins for the recipient, once per gift_events row.
-- The result is read from these rows, so every phone shows the same score. Cross-room PK has no server side yet.
-- 'active' covers the short countdown too (start_at is a few seconds after the start); a PK whose end_at has
-- passed is closed as 'done' the next time it is read or a new one starts. Safe to run again.
CREATE TABLE IF NOT EXISTS room_pks (
  id           bigserial PRIMARY KEY,
  room_id      uuid NOT NULL REFERENCES rooms(id),
  mode         text NOT NULL CHECK (mode IN ('solo', 'team')),
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'done', 'cancelled')),
  started_by   uuid NOT NULL REFERENCES users(id),
  ref          text NOT NULL,
  duration_min int NOT NULL CHECK (duration_min IN (15, 30, 60, 120)),
  -- Normal PK: everyone competing. Takım PK: the two teams (participants is both, for lookups).
  participants uuid[] NOT NULL,
  red          uuid[] NOT NULL DEFAULT '{}',
  blue         uuid[] NOT NULL DEFAULT '{}',
  start_at     timestamptz NOT NULL,
  end_at       timestamptz NOT NULL,
  cancelled_by uuid REFERENCES users(id),
  cancelled_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (started_by, ref)
);
-- One running PK per room.
CREATE UNIQUE INDEX IF NOT EXISTS room_pks_one_open ON room_pks(room_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS room_pks_room ON room_pks(room_id, id DESC);

CREATE TABLE IF NOT EXISTS room_pk_gifts (
  pk_id      bigint NOT NULL REFERENCES room_pks(id),
  gift_event bigint NOT NULL REFERENCES gift_events(id),
  sender     uuid NOT NULL REFERENCES users(id),
  recipient  uuid NOT NULL REFERENCES users(id),
  team       text CHECK (team IN ('red', 'blue')),
  points     bigint NOT NULL CHECK (points > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pk_id, gift_event)
);
