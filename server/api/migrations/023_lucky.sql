-- Uğurlu hediyeler on the server (lucky.mjs): the packages and odds the admins set, and every send with its draws.
-- One row of lucky_config (id 1); without it the server uses its built-in packages (lucky.mjs DEFAULT_CONFIG).
CREATE TABLE IF NOT EXISTS lucky_config (
  id         smallint PRIMARY KEY CHECK (id = 1),
  config     jsonb NOT NULL,
  version    int NOT NULL CHECK (version > 0),
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One request: `count` gifts of one package to each recipient, one draw per gift (in recipient order).
CREATE TABLE IF NOT EXISTS lucky_sends (
  id             bigserial PRIMARY KEY,
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- The app's request id: the same request twice is played once.
  ref            text NOT NULL,
  gift_id        text NOT NULL,
  room           text CHECK (char_length(room) <= 64),
  count          int NOT NULL CHECK (count > 0),
  recipients     uuid[] NOT NULL,
  unit_price     bigint NOT NULL CHECK (unit_price > 0),
  cost           bigint NOT NULL CHECK (cost > 0),
  -- What the recipients got as diamonds (their share of the price, all of them together).
  shared         bigint NOT NULL CHECK (shared >= 0),
  -- Paid to the sender in game coins: price × multiplier of every winning draw.
  payout         bigint NOT NULL DEFAULT 0 CHECK (payout >= 0),
  best_mult      int NOT NULL DEFAULT 0,
  draws          int[] NOT NULL,
  config_version int NOT NULL,
  -- The package's odds this send was drawn with (later edits never change it).
  odds           jsonb NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, ref)
);
CREATE INDEX IF NOT EXISTS lucky_sends_time ON lucky_sends (created_at DESC);
CREATE INDEX IF NOT EXISTS lucky_sends_user ON lucky_sends (user_id, id DESC);
