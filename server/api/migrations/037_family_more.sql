-- Aile, the rest (family-more.mjs): a short tag and a theme the leader picks, the daily check-in, and the weekly
-- milestone chests each member opened (one of each per person and week, whichever family they were in).
ALTER TABLE families ADD COLUMN IF NOT EXISTS tag text NOT NULL DEFAULT '' CHECK (char_length(tag) <= 8);
ALTER TABLE families ADD COLUMN IF NOT EXISTS theme text NOT NULL DEFAULT 'gece' CHECK (theme ~ '^[a-z]{1,20}$');
CREATE TABLE IF NOT EXISTS family_checkins (
  family_id bigint NOT NULL REFERENCES families(id),
  user_id uuid NOT NULL REFERENCES users(id),
  day date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day)
);
CREATE TABLE IF NOT EXISTS family_chest_claims (
  user_id uuid NOT NULL REFERENCES users(id),
  week date NOT NULL,
  chest text NOT NULL,
  family_id bigint NOT NULL REFERENCES families(id),
  coins int NOT NULL CHECK (coins > 0),
  ref text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, week, chest)
);
-- A gift sent from the family chat (gifts.mjs place 'family'): Gelir counts it on its own, the daily task too.
ALTER TABLE gift_events DROP CONSTRAINT IF EXISTS gift_events_place_check;
ALTER TABLE gift_events ADD CONSTRAINT gift_events_place_check CHECK (place IN ('chat', 'moment', 'profile', 'family'));
-- The family chat by author and day (the daily task), and the presence log by room (the family room's minutes).
CREATE INDEX IF NOT EXISTS family_messages_author ON family_messages (author, created_at);
CREATE INDEX IF NOT EXISTS presence_log_user_room ON presence_log (user_id, room, left_at);
