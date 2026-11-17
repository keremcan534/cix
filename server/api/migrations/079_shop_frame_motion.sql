-- Yönetim › Mağaza, step 4 (shop-items.mjs, docs/MAGAZA_YONETIMI.md), the admins' own frames:
--   - a moving version (motion_*): an animated WebP (a `shopframe` upload) the new app plays round the photo. The still
--     picture (art_*) stays: older apps, "Düşük veri modu" and small photos show it.
--   - where the photo's hole is (hole_x, hole_y: its centre as shares of the picture; NULL: the middle). A designer's
--     ring is often higher than the picture's middle (a crown above, a plate below); the photo goes into the ring.
ALTER TABLE shop_items ADD COLUMN motion_url text, ADD COLUMN motion_px int, ADD COLUMN motion_bytes int, ADD COLUMN hole_x numeric, ADD COLUMN hole_y numeric;
ALTER TABLE shop_items ADD CONSTRAINT shop_items_motion_check CHECK (motion_url IS NULL OR (NOT builtin AND kind = 'frame' AND art_url IS NOT NULL));
ALTER TABLE shop_items ADD CONSTRAINT shop_items_hole_at_check CHECK ((hole_x IS NULL) = (hole_y IS NULL) AND (hole_x IS NULL OR (NOT builtin AND kind = 'frame')));
