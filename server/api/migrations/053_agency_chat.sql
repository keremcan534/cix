-- Ajans sohbet grubu (agency-chat.mjs): one private group per agency, for its streamers, its owner and its staff.
-- A line stays with its agency; who may read it is decided at read time from the open memberships.
CREATE TABLE IF NOT EXISTS agency_messages (
  id bigserial PRIMARY KEY,
  agency_id uuid NOT NULL REFERENCES agencies(id),
  author uuid NOT NULL REFERENCES users(id),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agency_messages_of ON agency_messages (agency_id, id DESC);
CREATE INDEX IF NOT EXISTS agency_messages_author ON agency_messages (author, created_at);
