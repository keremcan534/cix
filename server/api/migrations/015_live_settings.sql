-- Live settings (Canlı ayarlar, live-settings.mjs): what the owner may change from the admin panel without a
-- deploy. Every change is a new row; the newest row per key wins. One admin save is one batch (a uuid the
-- server makes). JSON null = back to the built-in default (catalog.mjs / .env). Rows are never changed or deleted.
CREATE TABLE live_settings (
  id          bigserial PRIMARY KEY,
  batch       uuid NOT NULL,
  key         text NOT NULL CHECK (key ~ '^[a-z][a-z0-9_]{1,47}$'),
  -- 'null'::jsonb means the default.
  value       jsonb NOT NULL,
  reason      text NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 300),
  set_by      uuid NOT NULL REFERENCES users(id),
  -- The batch this one undoes.
  rollback_of uuid,
  ip          text NOT NULL DEFAULT '' CHECK (char_length(ip) <= 64),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX live_settings_key_idx ON live_settings (key, created_at DESC, id DESC);
CREATE INDEX live_settings_batch_idx ON live_settings (batch);
-- append_only() is from 006.
CREATE TRIGGER live_settings_append_only BEFORE UPDATE OR DELETE ON live_settings FOR EACH ROW EXECUTE FUNCTION append_only();
CREATE TRIGGER live_settings_no_truncate BEFORE TRUNCATE ON live_settings FOR EACH STATEMENT EXECUTE FUNCTION append_only();

-- Campaign coins are their own lot, tied to the purchase, so a store refund takes them back (jeton.mjs
-- refundPurchase). coin_lots_channel_check is Postgres's name for the column CHECK in 006, the only list.
-- diamond_locks.channel has no list CHECK: a 'kampanya' lock needs no change there.
ALTER TABLE coin_lots DROP CONSTRAINT coin_lots_channel_check;
ALTER TABLE coin_lots ADD CONSTRAINT coin_lots_channel_check CHECK (channel IN
  ('google', 'apple', 'test', 'bonus', 'legacy', 'jeton_noktasi', 'toptan', 'bozdurma', 'cevir', 'kampanya'));

-- The campaign coins a purchase got, and which campaign (finance-sync bonus_grant campaign_ref).
ALTER TABLE purchases
  ADD COLUMN campaign_bonus bigint NOT NULL DEFAULT 0 CHECK (campaign_bonus >= 0),
  ADD COLUMN campaign_ref   text CHECK (campaign_ref IS NULL OR campaign_ref ~ '^kampanya_[0-9]{8}_[0-9]{1,2}$');
