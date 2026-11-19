-- Yönetim › Mağaza (shop-items.mjs, docs/MAGAZA_YONETIMI.md), the admins' own frames: the part of the picture that is
-- drawn. A frame's square picture is often mostly transparent round its ornament; phones that sized it as the whole
-- square drew it too small on a seat and cut it. The server measures it (tools/frame-reach.py) when the picture or its
-- moving version is saved, and once at start for the frames saved before; the catalog turns it into `art.reach`.
--   - art_box_l, _t, _r, _b: the box round every pixel more than a little opaque, over the still picture and every
--     frame of its moving version, as shares of the picture's sides (left, top, right, bottom edges, 0..1). NULL: none
--     (not measured, nothing drawn, or the pictures couldn't be read): phones draw the frame as before.
--   - art_box_of: the pictures it was measured from (the still one's address, a space, the moving one's or nothing);
--     NULL: not measured yet. A box is used only while these are the frame's pictures.
ALTER TABLE shop_items ADD COLUMN IF NOT EXISTS art_box_l numeric(5,4), ADD COLUMN IF NOT EXISTS art_box_t numeric(5,4),
  ADD COLUMN IF NOT EXISTS art_box_r numeric(5,4), ADD COLUMN IF NOT EXISTS art_box_b numeric(5,4), ADD COLUMN IF NOT EXISTS art_box_of text;
ALTER TABLE shop_items ADD CONSTRAINT shop_items_art_box_check CHECK (
  (art_box_l IS NULL) = (art_box_t IS NULL) AND (art_box_l IS NULL) = (art_box_r IS NULL) AND (art_box_l IS NULL) = (art_box_b IS NULL)
  AND (art_box_of IS NULL OR (NOT builtin AND kind = 'frame'))
  AND (art_box_l IS NULL OR (art_box_of IS NOT NULL AND art_box_l >= 0 AND art_box_l < art_box_r AND art_box_r <= 1 AND art_box_t >= 0 AND art_box_t < art_box_b AND art_box_b <= 1))
);
