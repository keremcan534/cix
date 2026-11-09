-- Aile invites (families.mjs): the leader or a helper invites someone who has no family; they accept (and join)
-- or decline. Joining any family drops the person's other invites.
CREATE TABLE IF NOT EXISTS family_invites (
  family_id bigint NOT NULL REFERENCES families(id),
  user_id uuid NOT NULL REFERENCES users(id),
  invited_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (family_id, user_id)
);
CREATE INDEX IF NOT EXISTS family_invites_user ON family_invites (user_id, created_at DESC);
-- A family can be reported (social.mjs POST /api/report, type family).
ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_target_type_check;
ALTER TABLE reports ADD CONSTRAINT reports_target_type_check CHECK (target_type IN ('user', 'room', 'message', 'moment', 'comment', 'family'));
