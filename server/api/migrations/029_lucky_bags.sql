-- Şanslı çanta (lucky-bags.mjs): a bag of coins or gifts dropped in a room and shared at random by the first
-- people to open it. The sender pays it all when it is dropped; `parts` are the coins kept aside, lot by lot
-- ([{ lot, channel, amount, lockHours }]), and `shares` the units still in it, drawn then. What nobody took by
-- closes_at goes back to the sender (status 'returned').

-- Coins taken from a bag: their own channel ('canta'). coin_lots_channel_check is the list 024 set; every
-- channel it had stays.
ALTER TABLE coin_lots DROP CONSTRAINT coin_lots_channel_check;
ALTER TABLE coin_lots ADD CONSTRAINT coin_lots_channel_check CHECK (channel IN
  ('google', 'apple', 'test', 'bonus', 'legacy', 'jeton_noktasi', 'toptan', 'bozdurma', 'cevir', 'kampanya', 'odul', 'ugurlu', 'canta'));

CREATE TABLE IF NOT EXISTS lucky_bags (
  id             bigserial PRIMARY KEY,
  room           text NOT NULL CHECK (char_length(room) <= 64),
  sender         uuid NOT NULL REFERENCES users(id),
  kind           text NOT NULL CHECK (kind IN ('coins', 'gift')),
  gift_id        text,
  unit_price     int NOT NULL CHECK (unit_price > 0),
  units          int NOT NULL CHECK (units > 0),
  packets        int NOT NULL CHECK (packets > 0 AND packets <= units),
  shares         int[] NOT NULL,
  parts          jsonb NOT NULL,
  followers_only boolean NOT NULL DEFAULT false,
  opens_at       timestamptz NOT NULL,
  closes_at      timestamptz NOT NULL,
  status         text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'returned')),
  returned       int NOT NULL DEFAULT 0,
  ref            text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sender, ref),
  CHECK ((kind = 'gift') = (gift_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS lucky_bags_room_open ON lucky_bags (room, opens_at) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS lucky_bags_due ON lucky_bags (closes_at) WHERE status = 'open';

CREATE TABLE IF NOT EXISTS lucky_bag_grabs (
  bag_id     bigint NOT NULL REFERENCES lucky_bags(id),
  user_id    uuid NOT NULL REFERENCES users(id),
  units      int NOT NULL CHECK (units > 0),
  coins      int NOT NULL CHECK (coins > 0),
  gift_event bigint REFERENCES gift_events(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bag_id, user_id)
);
