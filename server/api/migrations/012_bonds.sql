-- Bağlar: two people tied as Çift, Kardeş, Ağabey, Kanka… (bonds.mjs). A request holds the bond gift's coins
-- (held_coins, the lots it used in held_lots) until the other person answers: accepted → the coins become their
-- diamonds like any gift; refused, expired or withdrawn → the coins go back to the sender's lots.
-- `a` is the requester, `b` the other person; pair_lo/pair_hi make "one bond per pair" one index.
CREATE TABLE bonds (
  id           bigserial PRIMARY KEY,
  a            uuid NOT NULL REFERENCES users(id),
  b            uuid NOT NULL REFERENCES users(id),
  pair_lo      uuid NOT NULL,
  pair_hi      uuid NOT NULL,
  kind         text NOT NULL CHECK (kind IN ('cift', 'kardes', 'baci', 'agabey', 'abla', 'yenge', 'enishte', 'kanka')),
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'refused', 'expired', 'withdrawn', 'ended')),
  held_coins   bigint NOT NULL CHECK (held_coins > 0),
  held_lots    jsonb NOT NULL DEFAULT '[]',
  -- Coins the two have spent on each other since the bond started (the bond gift included) and points
  -- from talking back and forth (at most 10 a day); score = coins / 100 + talk points.
  gift_coins   bigint NOT NULL DEFAULT 0,
  talk_points  int NOT NULL DEFAULT 0,
  talk_day     date,
  talk_today   int NOT NULL DEFAULT 0,
  ref          text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL DEFAULT now() + interval '3 days',
  accepted_at  timestamptz,
  ended_at     timestamptz,
  ended_by     uuid REFERENCES users(id),
  CHECK (a <> b),
  CHECK (pair_lo = LEAST(a, b) AND pair_hi = GREATEST(a, b)),
  UNIQUE (a, ref)
);
-- One open (pending or active) bond per pair, of any kind.
CREATE UNIQUE INDEX bonds_pair_open ON bonds (pair_lo, pair_hi) WHERE status IN ('pending', 'active');
CREATE INDEX bonds_a ON bonds (a, status);
CREATE INDEX bonds_b ON bonds (b, status);
CREATE INDEX bonds_pending_expiry ON bonds (expires_at) WHERE status = 'pending';

-- Hide my bonds from other people's view of my profile.
ALTER TABLE users ADD COLUMN bonds_hidden boolean NOT NULL DEFAULT false;
