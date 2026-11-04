-- Rüzgâr Gülü (wheel.mjs): one JACKPOT fund per tier, and one row per request (1, 10 or 50 spins) with what each
-- spin landed on and paid. The row's (user_id, ref) makes a repeated request a replay.
CREATE TABLE wheel_funds (
  tier       text PRIMARY KEY,
  jackpot    bigint NOT NULL CHECK (jackpot >= 0),
  won_at     timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE wheel_spins (
  id         bigserial PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ref        text NOT NULL,
  tier       text NOT NULL,
  spins      smallint NOT NULL CHECK (spins BETWEEN 1 AND 50),
  -- What it cost, and how much of that came from game coins (the rest from coins).
  cost       bigint NOT NULL CHECK (cost > 0),
  from_game  bigint NOT NULL DEFAULT 0 CHECK (from_game >= 0),
  -- Paid in game coins: every spin's prize, the JACKPOT part included.
  payout     bigint NOT NULL DEFAULT 0 CHECK (payout >= 0),
  jackpot    bigint NOT NULL DEFAULT 0 CHECK (jackpot >= 0),
  -- Highest fixed slice landed on, in thousandths of the spin price (the winners' list).
  best_milli int NOT NULL DEFAULT 0,
  slices     smallint[] NOT NULL,
  wins       bigint[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, ref)
);
CREATE INDEX wheel_spins_time ON wheel_spins (created_at DESC);
CREATE INDEX wheel_spins_user ON wheel_spins (user_id, id DESC);
