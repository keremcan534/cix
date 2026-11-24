-- Çarşı: an item moved to another section (shop-items.mjs moveToWave, owners 24 Nov 2026). A frame and a voice wave are
-- drawn differently (a picture round the photo; a ring the app draws), so a move makes a new voice wave like the frame
-- and takes the frame off the shelf (whoever has it keeps wearing it till it runs out). One row per moved item: it
-- isn't moved twice, and the owners' own move (fr-neon, ownerShopMoves) runs once.
CREATE TABLE shop_moves (
  from_id  text PRIMARY KEY,
  to_id    text NOT NULL,
  moved_at timestamptz NOT NULL DEFAULT now(),
  moved_by uuid REFERENCES users(id) ON DELETE SET NULL
);
