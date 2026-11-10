-- Profil ziyaretçileri: who opened whose profile (GET /api/user?visit=1). One row per pair: how many separate
-- visits in the current week (a visit within 10 minutes of the last counts once; a week without one starts the
-- count again) and when the last was. Rows older than 8 days are pruned (social.mjs); an erased account's rows go
-- with it (eraseAccount).
CREATE TABLE IF NOT EXISTS profile_visits (
  owner_id   uuid NOT NULL REFERENCES users(id),
  visitor_id uuid NOT NULL REFERENCES users(id),
  visits     integer NOT NULL DEFAULT 1,
  last_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, visitor_id),
  CHECK (owner_id <> visitor_id)
);
CREATE INDEX IF NOT EXISTS profile_visits_owner_recent ON profile_visits (owner_id, last_at DESC);
CREATE INDEX IF NOT EXISTS profile_visits_last ON profile_visits (last_at);
