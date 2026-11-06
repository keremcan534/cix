-- Ekonomi (economy.mjs): the server owns shop items and noble rank. One entitlements row per grant says who owns
-- which item and for how long; a row is live while it is not revoked, has started and has not ended (checked
-- against now() on every read, with no job). Reward coins get their own channel ('odul', shop only).

-- Reward coins (daily check-in, tasks, İlk adımlar; credited from a later step). They can only be spent in the
-- shop (wallet.mjs spendCoins `use`). coin_lots_channel_check is the list 015 set; every channel it had stays.
ALTER TABLE coin_lots DROP CONSTRAINT coin_lots_channel_check;
ALTER TABLE coin_lots ADD CONSTRAINT coin_lots_channel_check CHECK (channel IN
  ('google', 'apple', 'test', 'bonus', 'legacy', 'jeton_noktasi', 'toptan', 'bozdurma', 'cevir', 'kampanya', 'odul'));
CREATE INDEX coin_lots_odul_open ON coin_lots (user_id) WHERE channel = 'odul' AND remaining > 0;

-- Coins of a refunded store purchase, wherever they went (jeton.mjs refundPurchase marks the whole trail).
-- Cömertlik and the refund's item check read it, so refunded coins buy nothing that lasts.
ALTER TABLE coin_lots ADD COLUMN refunded_by bigint REFERENCES purchases(id);
WITH RECURSIVE t AS (
  SELECT l.id, p.id AS pid FROM coin_lots l JOIN purchases p ON p.id = l.purchase_id WHERE p.status = 'refunded'
  UNION ALL
  SELECT l.id, t.pid FROM coin_lots l JOIN t ON l.source_lot = t.id)
UPDATE coin_lots c SET refunded_by = t.pid FROM t WHERE c.id = t.id;   -- refunds made before this migration

-- What a person owns. Rows are never deleted or edited; only a live row can be revoked (the trigger below).
CREATE TABLE entitlements (
  id          bigserial PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id),
  sku         text NOT NULL CHECK (sku ~ '^[a-z0-9-]{2,40}$'),
  kind        text NOT NULL CHECK (kind IN ('frame', 'entry', 'ride', 'bubble', 'specialId', 'sticker', 'micfx', 'noble')),
  tier        smallint CHECK (tier BETWEEN 1 AND 15),
  price       bigint NOT NULL CHECK (price >= 0),      -- coins paid; 0 for a staff grant
  starts_at   timestamptz NOT NULL DEFAULT now(),
  ends_at     timestamptz,                              -- NULL: permanent
  source      text NOT NULL CHECK (source IN ('buy', 'bridge', 'migrate', 'admin')),
  ref         text NOT NULL,                            -- buy/bridge: the charge's ledger ref; admin: 'admin:<ref>'
  actor       uuid REFERENCES users(id),                -- the staff member of a grant
  revoked_at  timestamptz,
  revoked_why text CHECK (revoked_why IN ('iade', 'hesap silindi', 'destek')),  -- a code; staff text goes to the audit row
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, ref),                                -- entitlements_user_id_ref_key: a conflict is a replay (core.mjs once)
  CHECK (ends_at IS NULL OR ends_at > starts_at),
  CHECK (kind <> 'noble' OR tier IS NOT NULL),
  CHECK ((revoked_at IS NULL) = (revoked_why IS NULL))
);
CREATE INDEX entitlements_user ON entitlements (user_id, kind) WHERE revoked_at IS NULL;
CREATE INDEX entitlements_recent ON entitlements (user_id, created_at) WHERE source IN ('buy', 'bridge');
CREATE UNIQUE INDEX entitlements_permanent ON entitlements (user_id, sku) WHERE ends_at IS NULL AND revoked_at IS NULL;
-- Special IDs are permanent and one of a kind: the number is free again only when its row is revoked.
CREATE UNIQUE INDEX entitlements_special_id ON entitlements (sku) WHERE kind = 'specialId' AND revoked_at IS NULL;

CREATE FUNCTION entitlements_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'entitlements: rows are never deleted'; END IF;
  IF OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL
     OR (to_jsonb(NEW) - 'revoked_at' - 'revoked_why') <> (to_jsonb(OLD) - 'revoked_at' - 'revoked_why') THEN
    RAISE EXCEPTION 'entitlements: only revoking a row is allowed';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER entitlements_guard BEFORE UPDATE OR DELETE ON entitlements FOR EACH ROW EXECUTE FUNCTION entitlements_guard();
CREATE TRIGGER entitlements_no_truncate BEFORE TRUNCATE ON entitlements FOR EACH STATEMENT EXECUTE FUNCTION append_only();

-- What the person chose to wear, e.g. {"frame":"fr-neon","micfx":"an-mic-neon"}. Only a choice: what shows is
-- worked out on every read against live rows, so an expired or revoked item never shows.
ALTER TABLE users ADD COLUMN equipped jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(equipped) = 'object');
