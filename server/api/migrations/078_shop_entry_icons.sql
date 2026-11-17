-- Yönetim › Mağaza, step 3 (shop-items.mjs, docs/MAGAZA_YONETIMI.md): an icon for the admins' own entry effects, the
-- picture the shop shows above the effect's banner (a PNG or WebP, uploaded as a `shopframe`). The app's own entry
-- effects keep the app's pictures; frames, bubbles and waves are drawn from their own picture or look.
ALTER TABLE shop_items ADD COLUMN icon_url text, ADD COLUMN icon_px int;
ALTER TABLE shop_items ADD CONSTRAINT shop_items_icon_check CHECK (icon_url IS NULL OR (NOT builtin AND kind = 'entry'));
