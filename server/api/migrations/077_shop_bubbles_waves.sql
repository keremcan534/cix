-- Yönetim › Mağaza, step 2 (shop-items.mjs, docs/MAGAZA_YONETIMI.md): chat bubbles and voice waves too.
--   - The app's own (catalog.mjs SHOP, kinds bubble and wave) get a row once something about them changes, as the
--     frames and entry effects do (every NULL column "as in the app").
--   - The admins' own chat bubbles ('sb' and a number) and voice waves ('sw' and a number) carry their look (`look`):
--     a bubble its two colours and its text colour, and a picture (art_*) drawn as a nine-slice with the corners kept
--     (`look.slice`); a wave its style and colours, and a picture for its sparks (art_*), for the sparkle style.
ALTER TABLE shop_items DROP CONSTRAINT shop_items_kind_check;
ALTER TABLE shop_items ADD CONSTRAINT shop_items_kind_check CHECK (kind IN ('frame', 'entry', 'bubble', 'wave'));
ALTER TABLE shop_items ADD COLUMN look jsonb;
-- An admin's bubble or wave has its look, nothing else has one (an app's item keeps the app's).
ALTER TABLE shop_items ADD CONSTRAINT shop_items_look_check
  CHECK (CASE WHEN builtin THEN look IS NULL ELSE (kind IN ('bubble', 'wave')) = (look IS NOT NULL) END);
