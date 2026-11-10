-- Gizlilik and "Kimler ulaşabilir" (privacy.mjs): what each person shows others and who may reach them. One row per
-- person who changed something; no row means the defaults (everything shown, anyone may message, call and invite),
-- and a row set back to the defaults is deleted. The row goes with the account (social.mjs eraseAccount).
CREATE TABLE IF NOT EXISTS privacy_settings (
  user_id uuid PRIMARY KEY REFERENCES users(id),
  profile_public boolean NOT NULL DEFAULT true,
  show_online boolean NOT NULL DEFAULT true,
  show_last_seen boolean NOT NULL DEFAULT true,
  show_current_room boolean NOT NULL DEFAULT true,
  dm_from text NOT NULL DEFAULT 'everyone' CHECK (dm_from IN ('everyone', 'following', 'mutual')),
  calls_from text NOT NULL DEFAULT 'everyone' CHECK (calls_from IN ('everyone', 'following', 'nobody')),
  invites_from text NOT NULL DEFAULT 'everyone' CHECK (invites_from IN ('everyone', 'following', 'nobody')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Mesajlar › Aramalar › "Arama geçmişini temizle" (call-log.mjs): my calls up to this id are left out of my history.
-- The other person's history and the call rows themselves (accounting records) stay. Goes with the account.
CREATE TABLE IF NOT EXISTS call_history_cleared (
  user_id uuid PRIMARY KEY REFERENCES users(id),
  before_id bigint NOT NULL,
  cleared_at timestamptz NOT NULL DEFAULT now()
);
