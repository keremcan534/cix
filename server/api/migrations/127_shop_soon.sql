-- Çarşı: "Yakında" (shop-items.mjs, owners 25 Nov 2026): an item on the shelf with a "Yakında" tag, not sold. NULL: as
-- the default (an app's item: SHOP_SOON_DEFAULT, every Özel ID and Takma isim; an admin's: not). Özel ID (specialId)
-- joins the kinds Yönetim › Mağaza manages: the app's own only.
ALTER TABLE shop_items ADD COLUMN soon boolean;
ALTER TABLE shop_items DROP CONSTRAINT shop_items_kind_check;
ALTER TABLE shop_items ADD CONSTRAINT shop_items_kind_check CHECK (kind IN ('frame', 'entry', 'bubble', 'wave', 'seat', 'ride', 'specialId'));
ALTER TABLE shop_items DROP CONSTRAINT shop_items_ride_builtin;
ALTER TABLE shop_items ADD CONSTRAINT shop_items_app_only CHECK (kind NOT IN ('ride', 'specialId') OR builtin);
