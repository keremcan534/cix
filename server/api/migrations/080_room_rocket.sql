-- Oda roketi (room-rocket.mjs, docs/ODA_ROKETI.md): the coins people spend on gifts in a server room fill its rocket,
-- day by day on Istanbul's calendar. Five levels in a row, each with its goal; a full level launches and its prizes
-- are drawn among the people who filled it.

-- The levels' goals and prizes and whether the rocket is on (one row, saved from the panel; versioned).
CREATE TABLE room_rocket_config (
  id          int PRIMARY KEY CHECK (id = 1),
  config      jsonb NOT NULL,
  version     int NOT NULL,
  updated_by  uuid REFERENCES users(id),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- A room's day: the coins given in it (fuel) and how many of its levels have launched.
CREATE TABLE room_rockets (
  room_id     uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  day         date NOT NULL,
  fuel        bigint NOT NULL DEFAULT 0 CHECK (fuel >= 0),
  launched    smallint NOT NULL DEFAULT 0 CHECK (launched BETWEEN 0 AND 5),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, day)
);

-- What each person put into each level (a gift past a level's goal fills the next with the rest).
CREATE TABLE room_rocket_fuel (
  room_id     uuid NOT NULL,
  day         date NOT NULL,
  level       smallint NOT NULL CHECK (level BETWEEN 1 AND 5),
  user_id     uuid NOT NULL REFERENCES users(id),
  coins       bigint NOT NULL CHECK (coins > 0),
  first_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, day, level, user_id),
  FOREIGN KEY (room_id, day) REFERENCES room_rockets (room_id, day) ON DELETE CASCADE
);

-- A level that filled: its goal and prizes as they were set then; drawn and paid once (paid_at), in a transaction
-- of its own after the gift that filled it.
CREATE TABLE room_rocket_launches (
  id          bigserial PRIMARY KEY,
  room_id     uuid NOT NULL,
  day         date NOT NULL,
  level       smallint NOT NULL CHECK (level BETWEEN 1 AND 5),
  goal        bigint NOT NULL,
  prizes      jsonb NOT NULL,
  launched_at timestamptz NOT NULL DEFAULT now(),
  paid_at     timestamptz,
  winners     int NOT NULL DEFAULT 0,
  UNIQUE (room_id, day, level),
  FOREIGN KEY (room_id, day) REFERENCES room_rockets (room_id, day) ON DELETE CASCADE
);
CREATE INDEX room_rocket_launches_unpaid ON room_rocket_launches (launched_at) WHERE paid_at IS NULL;
CREATE INDEX room_rocket_launches_recent ON room_rocket_launches (launched_at DESC);

-- Who won what at a launch; `ref` is the coins' ledger ref or the item's entitlement ref (rocket:<launch>:<n>).
-- outcome: paid, or why an item wasn't given (owned: had it for good; too_far: already a year ahead; gone: no longer
-- in the shop).
CREATE TABLE room_rocket_wins (
  launch_id   bigint NOT NULL REFERENCES room_rocket_launches(id) ON DELETE CASCADE,
  slot        int NOT NULL,
  user_id     uuid NOT NULL REFERENCES users(id),
  prize       jsonb NOT NULL,
  ref         text NOT NULL,
  outcome     text NOT NULL CHECK (outcome IN ('paid', 'owned', 'too_far', 'gone')),
  PRIMARY KEY (launch_id, slot),
  UNIQUE (launch_id, user_id)
);
CREATE INDEX room_rocket_wins_user ON room_rocket_wins (user_id);

-- A shop item won from a rocket is an entitlement of its own source (price 0, like a staff grant).
ALTER TABLE entitlements DROP CONSTRAINT entitlements_source_check;
ALTER TABLE entitlements ADD CONSTRAINT entitlements_source_check CHECK (source IN ('buy', 'bridge', 'migrate', 'admin', 'rocket'));
