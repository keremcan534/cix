-- A streamer who leaves a family of their own accord can't join another one for a while (Canlı ayarlar family_rejoin_days,
-- 90 days to begin with). One row a person: the last time they left. They may go back to the family they left.
CREATE TABLE IF NOT EXISTS family_cooldowns (
  user_id    uuid PRIMARY KEY REFERENCES users(id),
  family_id  bigint NOT NULL,
  until      timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
