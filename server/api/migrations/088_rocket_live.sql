-- Canlı Yörünge (rocket-live.mjs): Oyun Salonu's rocket played live by everyone at once. One row per round: the
-- crash point (drawn when the round opens, told to nobody before the crash), the house share it opened with, where it
-- stands and its money: the fuel on board, the house's part, the reserve taken from the payout pool at launch (the
-- most the round can pay) and what it paid. Each person's fuel is a casino_rounds row (game 'rocket') that points at
-- its round, so Oyun Merkezi's history, the daily limit, the report, the data copy and account deletion see it as any
-- round. No user in this table. Kept 180 days, as the rounds.
CREATE TABLE IF NOT EXISTS rocket_rounds (
  id          bigserial PRIMARY KEY,
  -- In hundredths: 215 is 2,15×; 0 blows up on the pad. `cut`: where the pool stopped the climb, when it had to.
  crash       integer NOT NULL CHECK (crash >= 0),
  cut         integer CHECK (cut >= 0),
  house_pct   smallint NOT NULL CHECK (house_pct BETWEEN 1 AND 99),
  -- bet: fuel goes on board · fly: in the air · settling: blown up, automatic escapes being paid · done · void (a
  -- restart in the middle: the fuel still on board came back).
  state       text NOT NULL DEFAULT 'bet' CHECK (state IN ('bet', 'fly', 'settling', 'done', 'void')),
  bet_until   timestamptz NOT NULL,
  launched_at timestamptz,
  ended_at    timestamptz,
  total_bet   bigint NOT NULL DEFAULT 0 CHECK (total_bet >= 0),
  house       bigint NOT NULL DEFAULT 0 CHECK (house >= 0),
  reserve     bigint NOT NULL DEFAULT 0 CHECK (reserve >= 0),
  paid        bigint NOT NULL DEFAULT 0 CHECK (paid >= 0),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rocket_rounds_open ON rocket_rounds (id) WHERE state IN ('bet', 'fly', 'settling');
CREATE INDEX IF NOT EXISTS rocket_rounds_time ON rocket_rounds (created_at);

-- A fuel of Canlı Yörünge in casino_rounds: its round, its automatic escape and where it left (hundredths; 0: it blew
-- up with the rocket; null: still on board), and the house's part booked at launch (the other games book 60 %).
ALTER TABLE casino_rounds ADD COLUMN IF NOT EXISTS live_round bigint;
ALTER TABLE casino_rounds ADD COLUMN IF NOT EXISTS auto integer CHECK (auto > 100);
ALTER TABLE casino_rounds ADD COLUMN IF NOT EXISTS cashed integer CHECK (cashed >= 0);
ALTER TABLE casino_rounds ADD COLUMN IF NOT EXISTS house bigint CHECK (house >= 0);
CREATE INDEX IF NOT EXISTS casino_rounds_live ON casino_rounds (live_round, user_id) WHERE live_round IS NOT NULL;
