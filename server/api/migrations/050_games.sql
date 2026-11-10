-- Oyun Salonu on the server (casino.mjs, casino-rules.mjs): one row per round with what it cost, what it paid and
-- the round for the screen to replay; the house book (payout pool) and one JACKPOT fund per slot that has one.
-- The row's (user_id, ref) makes a repeated request a replay. Rounds are kept 180 days (the history and the daily
-- limit need only the last ones; the ledger keeps the money trail) and go with the account (eraseAccount).
CREATE TABLE IF NOT EXISTS casino_rounds (
  id         bigserial PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ref        text NOT NULL CHECK (char_length(ref) <= 64),
  game       text NOT NULL CHECK (char_length(game) <= 20),
  -- What it cost, and how much of that came from game coins (the rest from coins).
  bet        bigint NOT NULL CHECK (bet > 0),
  from_game  bigint NOT NULL DEFAULT 0 CHECK (from_game >= 0),
  -- Paid in game coins: line or board wins plus any JACKPOT.
  payout     bigint NOT NULL DEFAULT 0 CHECK (payout >= 0),
  jackpot    bigint NOT NULL DEFAULT 0 CHECK (jackpot >= 0),
  -- The pick (a fish, a rocket target) or a board's bets (option → coins).
  pick       text CHECK (char_length(pick) <= 20),
  bets       jsonb,
  -- Opened from Oyun Merkezi or from inside a room (only which of the two, not which room).
  place      text NOT NULL DEFAULT 'profile' CHECK (place IN ('profile', 'room')),
  detail     text NOT NULL CHECK (char_length(detail) <= 200),
  outcome    jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, ref)
);
CREATE INDEX IF NOT EXISTS casino_rounds_user ON casino_rounds (user_id, id DESC);
CREATE INDEX IF NOT EXISTS casino_rounds_day ON casino_rounds (user_id, game, created_at);
CREATE INDEX IF NOT EXISTS casino_rounds_time ON casino_rounds (created_at);

-- The house book of every Oyun Salonu game (one row): coins played, the house's 60 %, the payout pool the winnings
-- come from (it starts at a house advance, `seed`) and what it paid.
CREATE TABLE IF NOT EXISTS casino_bank (
  id         smallint PRIMARY KEY CHECK (id = 1),
  wagered    bigint NOT NULL DEFAULT 0,
  house      bigint NOT NULL DEFAULT 0,
  pool       bigint NOT NULL CHECK (pool >= 0),
  paid       bigint NOT NULL DEFAULT 0,
  seed       bigint NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS casino_jackpots (
  game       text PRIMARY KEY,
  fund       bigint NOT NULL CHECK (fund >= 0),
  won_at     timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
