-- Koltuk rengi (room-seat-color.mjs): the color of a room's empty mics (null: the free turquoise) and the colors the
-- room owns, each bought once by its owner and kept, so going back to one costs nothing.
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS seat_color text;
CREATE TABLE IF NOT EXISTS room_seat_colors (
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  color text NOT NULL,
  buyer uuid NOT NULL REFERENCES users(id),
  price int NOT NULL CHECK (price > 0),
  ref text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room_id, color),
  UNIQUE (buyer, ref)
);
