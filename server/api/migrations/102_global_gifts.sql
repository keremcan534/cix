-- Global hediye (Güncelleme 7, item 12; global-gifts.mjs, docs/HEDIYE_YONETIMI.md "Global hediye"): a gift the admins
-- mark global is announced, once it is paid, in every room of the sender's country. On an admin's gift and on a row of
-- the app's own gifts alike; NULL is "not global" (the app's own value), so a row made for another change keeps it off.
-- Never a bond gift (a request, not a gift yet) nor Koruma Kartı; the minimum price is a Canlı ayar, checked at save.
ALTER TABLE custom_gifts ADD COLUMN IF NOT EXISTS global boolean CHECK (global IS NOT FALSE);
ALTER TABLE custom_gifts ADD CONSTRAINT custom_gifts_global_kind CHECK (global IS NULL OR NOT (id = 'koruma' OR id ~ '^bag-'));

-- Gizlilik › "Adım genel duyurularda görünmesin" (privacy.mjs globalHideName): a global gift I send or receive names me
-- as "Bir kullanıcı", without my photo. Off at first.
ALTER TABLE privacy_settings ADD COLUMN IF NOT EXISTS global_hide_name boolean NOT NULL DEFAULT false;
