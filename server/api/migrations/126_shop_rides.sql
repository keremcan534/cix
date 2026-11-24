-- Çarşı › Binekler (shop-items.mjs, owners 25 Nov 2026): the app's own rides (Scooter, Spor Araba, Özel Jet) are
-- managed in Yönetim › Mağaza like the app's frames: a row once something about one changes (every NULL column "as in
-- the app"). No admin's own ride: the app draws each.
ALTER TABLE shop_items DROP CONSTRAINT shop_items_kind_check;
ALTER TABLE shop_items ADD CONSTRAINT shop_items_kind_check CHECK (kind IN ('frame', 'entry', 'bubble', 'wave', 'seat', 'ride'));
ALTER TABLE shop_items ADD CONSTRAINT shop_items_ride_builtin CHECK (kind <> 'ride' OR builtin);
