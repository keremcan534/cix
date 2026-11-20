-- Profil izleri (profile-marks.mjs, docs/PROFIL_IZLERI.md): a Kutlama gift that leaves a mark on its receiver's profile
-- photo (💩 Kaka), and one that cleans it (💧 Su). The owners' rules (Güncelleme 7, item 11): a mark lasts a while
-- (Canlı ayarlar › Profil izleri, 24 hours) or until someone sends the gift that cleans it; a second one restarts the
-- time, never stacks; anyone may refuse marks in Gizlilik ("Profilime iz bırakılmasın").
--
-- Which gift does what is data on the gift rows, so the panel can make other pairs: mark_role 'leave' (it leaves a mark
-- of mark_kind, for mark_hours or the Canlı ayar's hours when NULL), 'clean' (it cleans mark_kind), 'none' (a plain
-- gift). On a row of one of the app's own gifts (builtin) NULL is "as in the app" (profile-mark-rules.mjs APP_MARKS),
-- as every other column there; on an admin's gift NULL is a plain gift.
ALTER TABLE custom_gifts
  ADD COLUMN IF NOT EXISTS mark_role text CHECK (mark_role IN ('none', 'leave', 'clean')),
  ADD COLUMN IF NOT EXISTS mark_kind text CHECK (mark_kind ~ '^[a-z][a-z0-9-]{0,23}$'),
  ADD COLUMN IF NOT EXISTS mark_hours smallint CHECK (mark_hours BETWEEN 1 AND 168);

-- Gizlilik: "Profilime iz bırakılmasın" (privacy.mjs profileMarks). On by default: marks may be left.
ALTER TABLE privacy_settings ADD COLUMN IF NOT EXISTS profile_marks boolean NOT NULL DEFAULT true;

-- One row per mark left. Active: not cleared and not expired (expires_at > now()); a second mark of the same kind ends
-- the one before (its expires_at set to that moment) and starts its own, so one person has at most one active mark of
-- a kind. Written inside the gift's transaction, after both people's users rows are locked (gifts.mjs), never twice.
-- cleared_how: 'gift' (someone sent the cleaning gift: cleared_by, clear_event_id), 'admin' (Yönetim, an audit_events
-- row), 'self' (they refused marks in Gizlilik), 'block' (they blocked the person who left it).
-- Kept for the receiver's data copy and moderation; the receiver's rows go with their account (social.mjs
-- eraseAccount), the leaver's stay with their name gone, as gift_events do.
CREATE TABLE IF NOT EXISTS profile_marks (
  id             bigserial PRIMARY KEY,
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_user      uuid REFERENCES users(id) ON DELETE SET NULL,
  kind           text NOT NULL CHECK (kind ~ '^[a-z][a-z0-9-]{0,23}$'),
  gift_id        text NOT NULL CHECK (char_length(gift_id) <= 32),
  gift_event_id  bigint REFERENCES gift_events(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL,
  cleared_at     timestamptz,
  cleared_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  clear_event_id bigint REFERENCES gift_events(id) ON DELETE SET NULL,
  cleared_how    text CHECK (cleared_how IN ('gift', 'admin', 'self', 'block')),
  CHECK ((cleared_at IS NULL) = (cleared_how IS NULL))
);
-- The marks that may still show: a profile, a room's looks and a gift read them by person.
CREATE INDEX IF NOT EXISTS profile_marks_open ON profile_marks (user_id, kind) WHERE cleared_at IS NULL;
-- The marks someone left (their data copy, a block, their account's deletion).
CREATE INDEX IF NOT EXISTS profile_marks_from ON profile_marks (from_user) WHERE from_user IS NOT NULL;
