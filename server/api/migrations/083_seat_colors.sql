-- Koltuk renkleri from the panel (room-seat-color.mjs, shop-items.mjs kind seat, docs/MAGAZA_YONETIMI.md):
--   - shop_items holds the seat colors too: the app's own (catalog.mjs SEAT_COLORS, their id as id) change their name,
--     price, days, on/off, order and color (`look`: { color }); the admins' own ('sc' and a number) are rows of their own.
--   - a bought color lasts the color's days (ends_at; NULL: for good, as every color bought before this was).
ALTER TABLE shop_items DROP CONSTRAINT shop_items_kind_check;
ALTER TABLE shop_items ADD CONSTRAINT shop_items_kind_check CHECK (kind IN ('frame', 'entry', 'bubble', 'wave', 'seat'));
-- A seat color's look is its color, the app's own included; a bubble or wave of the admins' has its look.
ALTER TABLE shop_items DROP CONSTRAINT shop_items_look_check;
ALTER TABLE shop_items ADD CONSTRAINT shop_items_look_check
  CHECK (CASE WHEN builtin THEN look IS NULL OR kind = 'seat' ELSE (kind IN ('bubble', 'wave', 'seat')) = (look IS NOT NULL) END);
ALTER TABLE room_seat_colors ADD COLUMN ends_at timestamptz;
