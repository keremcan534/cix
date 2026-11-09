-- Hareketli in rooms (room-fx.mjs): one row per paid room animation (Kelebekler, Gül Buketi, Altın Yağmuru…), so
-- support can see who sent what, where and for how much. Free reactions go phone to phone and have no row.
CREATE TABLE IF NOT EXISTS room_animations (
  id bigserial PRIMARY KEY,
  room text NOT NULL,
  sender uuid NOT NULL REFERENCES users(id),
  animation_id text NOT NULL,
  price int NOT NULL CHECK (price > 0),
  ref text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sender, ref)
);
CREATE INDEX IF NOT EXISTS room_animations_room ON room_animations (room, created_at);
