-- Oda etkinlikleri (room-events.mjs): what a server room's owner or Süper Yönetici plans (title, a short
-- description, when as they wrote it, a kind), who said they are going, and a cancel. The same on every phone.
CREATE TABLE IF NOT EXISTS room_events (
  id bigserial PRIMARY KEY,
  room_id uuid NOT NULL REFERENCES rooms(id),
  creator uuid NOT NULL REFERENCES users(id),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 40),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 120),
  when_text text NOT NULL CHECK (char_length(when_text) BETWEEN 1 AND 40),
  kind text NOT NULL DEFAULT 'Sohbet' CHECK (char_length(kind) BETWEEN 1 AND 20),
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS room_events_room ON room_events (room_id, created_at DESC);
CREATE TABLE IF NOT EXISTS room_event_going (
  event_id bigint NOT NULL REFERENCES room_events(id),
  user_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);
