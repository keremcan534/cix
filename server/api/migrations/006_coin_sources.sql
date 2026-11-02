-- Where every coin came from, when the diamonds it turns into may leave, and records for disputes.
--
--  * Every coin is in a lot: its channel (Google Play, App Store, Jeton Noktası, wholesale, Çevir…), date,
--    supplier and lock. A spend says in the ledger which lots it used; a gift says which lot each diamond came
--    from (diamond_locks).
--  * Gifted store coins lock the recipient's diamonds for 7 days (refund window), Jeton Noktası coins for 1 day
--    (wallet.mjs LOCK_HOURS). Only unlocked diamonds can be exchanged, sold to a Jeton Noktası or withdrawn. A
--    store refund takes back the buyer's unspent coins and the diamonds still locked.
--  * The ledger also keeps the channel, who pressed the button (actor) and the details; Jeton Noktası
--    transfers and staff actions have their own tables. The ledger, the transfers and the staff log can't be
--    changed or deleted.

-- A Jeton Noktası (coins bank) account: sells coins to people for cash outside the app, buys hosts' diamonds,
-- buys its own stock from management. Only an admin turns it on (jeton.mjs).
ALTER TABLE users DROP CONSTRAINT users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('user', 'moderator', 'admin', 'coins_bank'));

-- Coins moved by or through a Jeton Noktası:
--   wholesale    management → bank (from_user NULL); value_tl = what the bank pays management
--   bank_sale    bank → a person who paid the bank (payment_ref = the bank's receipt)
--   diamond_sale a host's diamonds → the bank's coins; value_tl = what the bank pays the host
CREATE TABLE coin_transfers (
  id          bigserial PRIMARY KEY,
  kind        text NOT NULL CHECK (kind IN ('wholesale', 'bank_sale', 'diamond_sale')),
  from_user   uuid REFERENCES users(id),
  to_user     uuid NOT NULL REFERENCES users(id),
  coins       bigint NOT NULL CHECK (coins > 0),
  diamonds    bigint CHECK (diamonds > 0),
  value_tl    numeric(16, 2) CHECK (value_tl >= 0),
  payment_ref text NOT NULL DEFAULT '' CHECK (char_length(payment_ref) <= 100),
  note        text NOT NULL DEFAULT '' CHECK (char_length(note) <= 200),
  -- Who did it: the bank's operator, the host, or the admin who booked a wholesale.
  actor       uuid NOT NULL REFERENCES users(id),
  ip          text NOT NULL DEFAULT '' CHECK (char_length(ip) <= 64),
  ref         text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (actor, ref)
);
CREATE INDEX coin_transfers_from ON coin_transfers(from_user, created_at DESC);
CREATE INDEX coin_transfers_to ON coin_transfers(to_user, created_at DESC);

-- One row per credit of coins from one source. `remaining` goes down as the coins are spent; the sum of an
-- account's remaining equals users.coins.
CREATE TABLE coin_lots (
  id          bigserial PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id),
  channel     text NOT NULL CHECK (channel IN ('google', 'apple', 'test', 'bonus', 'legacy', 'jeton_noktasi', 'toptan', 'bozdurma', 'cevir')),
  amount      bigint NOT NULL CHECK (amount > 0),
  remaining   bigint NOT NULL CHECK (remaining >= 0 AND remaining <= amount),
  -- How long diamonds bought with these coins stay locked; fixed when the lot is made.
  lock_hours  int NOT NULL CHECK (lock_hours >= 0),
  purchase_id bigint REFERENCES purchases(id),
  transfer_id bigint REFERENCES coin_transfers(id),
  -- A Jeton Noktası sale: the bank's lot the coins came from (refunds follow it).
  source_lot  bigint REFERENCES coin_lots(id),
  -- Who supplied the coins (the bank, the host who sold diamonds); NULL = a store or the platform.
  source_user uuid REFERENCES users(id),
  ref         text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX coin_lots_open ON coin_lots(user_id, id) WHERE remaining > 0;
CREATE INDEX coin_lots_user ON coin_lots(user_id, id DESC);
CREATE INDEX coin_lots_purchase ON coin_lots(purchase_id) WHERE purchase_id IS NOT NULL;
CREATE INDEX coin_lots_source ON coin_lots(source_lot) WHERE source_lot IS NOT NULL;

-- Diamonds received from a gift, per lot of the sender's coins: locked until unlock_at. 'reversed' = taken
-- back by a store refund.
CREATE TABLE diamond_locks (
  id          bigserial PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id),
  sender      uuid REFERENCES users(id),
  amount      bigint NOT NULL CHECK (amount > 0),
  channel     text NOT NULL CHECK (char_length(channel) <= 20),
  unlock_at   timestamptz NOT NULL,
  gift_event  bigint REFERENCES gift_events(id),
  coin_lot    bigint REFERENCES coin_lots(id),
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'reversed')),
  ref         text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX diamond_locks_user ON diamond_locks(user_id, unlock_at) WHERE status = 'active';
CREATE INDEX diamond_locks_lot ON diamond_locks(coin_lot);

-- Ledger: channel of the coins or diamonds, who did it when it wasn't the account itself (bank, admin) and
-- the details (lots used, purchase, transfer, gift, unlock times).
ALTER TABLE ledger
  ADD COLUMN channel text CHECK (char_length(channel) <= 20),
  ADD COLUMN actor   uuid REFERENCES users(id),
  ADD COLUMN detail  jsonb NOT NULL DEFAULT '{}';

-- Staff actions on money and roles: Jeton Noktası on/off, wholesale, refunds.
CREATE TABLE audit_events (
  id         bigserial PRIMARY KEY,
  actor      uuid REFERENCES users(id),
  action     text NOT NULL CHECK (char_length(action) <= 40),
  target     uuid REFERENCES users(id),
  detail     jsonb NOT NULL DEFAULT '{}',
  ip         text NOT NULL DEFAULT '' CHECK (char_length(ip) <= 64),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_target ON audit_events(target, created_at DESC);

-- Records nobody may change or delete, the API included.
CREATE FUNCTION append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% kayıtları değiştirilemez ve silinemez', TG_TABLE_NAME;
END $$;
CREATE TRIGGER ledger_append_only BEFORE UPDATE OR DELETE ON ledger FOR EACH ROW EXECUTE FUNCTION append_only();
CREATE TRIGGER ledger_no_truncate BEFORE TRUNCATE ON ledger FOR EACH STATEMENT EXECUTE FUNCTION append_only();
CREATE TRIGGER coin_transfers_append_only BEFORE UPDATE OR DELETE ON coin_transfers FOR EACH ROW EXECUTE FUNCTION append_only();
CREATE TRIGGER coin_transfers_no_truncate BEFORE TRUNCATE ON coin_transfers FOR EACH STATEMENT EXECUTE FUNCTION append_only();
CREATE TRIGGER audit_events_append_only BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION append_only();
CREATE TRIGGER audit_events_no_truncate BEFORE TRUNCATE ON audit_events FOR EACH STATEMENT EXECUTE FUNCTION append_only();

-- Coins held before this: one lot per account with the store lock, since their source is unknown.
INSERT INTO coin_lots (user_id, channel, amount, remaining, lock_hours, ref)
  SELECT id, 'legacy', coins, coins, 168, 'legacy-006' FROM users WHERE coins > 0;
