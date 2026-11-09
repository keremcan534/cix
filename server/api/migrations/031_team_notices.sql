-- Similar Ekibi: what the management sends to everyone or to one person (events, updates, rewards, rules,
-- announcements), read in Mesajlar › Similar Ekibi; a notice for everyone may also be an Odalar banner for a few
-- days (team.mjs). Removed notices stay for the audit trail, hidden.
CREATE TABLE team_notices (
  id         bigserial PRIMARY KEY,
  kind       text NOT NULL CHECK (kind IN ('event', 'update', 'reward', 'rule', 'notice')),
  title      text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 80),
  body       text NOT NULL DEFAULT '' CHECK (char_length(body) <= 1000),
  image_url  text CHECK (char_length(image_url) <= 500),
  link       text CHECK (char_length(link) <= 120),
  -- One person's notice (a reward, a warning); NULL: everyone.
  target     uuid REFERENCES users(id),
  -- Shown at the top of Odalar until ends_at (everyone's notices only).
  banner     boolean NOT NULL DEFAULT false CHECK (NOT banner OR (target IS NULL AND ends_at IS NOT NULL)),
  ends_at    timestamptz,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  removed_by uuid REFERENCES users(id)
);
CREATE INDEX team_notices_everyone ON team_notices(id DESC) WHERE target IS NULL AND removed_at IS NULL;
CREATE INDEX team_notices_target ON team_notices(target, id DESC) WHERE target IS NOT NULL;

-- The newest notice each person has seen (the unread count in Mesajlar).
CREATE TABLE team_notice_seen (
  user_id uuid PRIMARY KEY REFERENCES users(id),
  last_id bigint NOT NULL DEFAULT 0
);
