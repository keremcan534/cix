-- Şanslı çanta, Güncelleme 3: whoever taps the bag while it falls joins it (lucky_bag_entries, once each); when
-- its time is up the server deals the shares among them at random (lucky-bag-rules.mjs deal) and pays them all,
-- even when few joined. With nobody, the bag goes back to the sender as before. Winners are lucky_bag_grabs.
CREATE TABLE IF NOT EXISTS lucky_bag_entries (
  bag_id     bigint NOT NULL REFERENCES lucky_bags(id),
  user_id    uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bag_id, user_id)
);
