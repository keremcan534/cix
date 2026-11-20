-- Muzip hediyeler (docs/PROFIL_IZLERI.md, mark-kinds.mjs): the kinds of profile mark as data the panel keeps, so a new
-- joke pair needs no app update. Only additions: an older server ignores all of it (rollback, docs/PROFIL_IZLERI.md
-- "Geri alma").
--
-- A kind (kaka, kirik-cam, …) is what a gift that leaves a mark and the gifts that clean it share (custom_gifts
-- mark_kind, 101). Its row says how phones draw it: `name` (Kaka İzi, Kırık Cam), the overlay picture staff uploaded
-- (media.mjs markart, checked by tools/mark-art-check.py: real transparency, the face left open, square, still; at
-- most 512 px as phones get it) with its version and size, or none (art_url NULL: the app's own compiled picture
-- where it has one, else the gift's badge). `minutes`: how long its mark stays when the gift says nothing (NULL: Canlı
-- ayarlar › Profil izleri). `stack`: how the record keeps the same kind again (the newest sender's mark shows either
-- way and never ends sooner than the one before; refresh: the old row expires; replace: it is set aside as
-- 'replaced'); while a mark shows, a gift of another kind leaves none (one mark at a time, the owners' decisions,
-- 20 Nov 2026: a plain gift, profile-marks.mjs markGift). `enabled` false: its gifts are
-- plain gifts and its marks don't show. `rev` takes the next mark_kind_rev on every change, and the catalog's `v` adds
-- the largest, so phones read the catalog again. A row is never deleted (deleted_at): marks and audit rows name it.
CREATE SEQUENCE IF NOT EXISTS mark_kind_rev;
CREATE TABLE IF NOT EXISTS mark_kinds (
  kind        text PRIMARY KEY CHECK (kind ~ '^[a-z][a-z0-9-]{0,23}$'),
  name        text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 24),
  art_url     text CHECK (char_length(art_url) <= 500),
  art_v       text CHECK (art_v ~ '^[0-9a-f]{12}$'),
  art_px      integer CHECK (art_px BETWEEN 64 AND 1024),
  art_bytes   integer CHECK (art_bytes > 0),
  -- What the pixel check measured (shares 0..1: fully transparent pixels, the face circle covered), for the panel.
  art_stats   jsonb,
  art_checked boolean NOT NULL DEFAULT false,
  minutes     integer CHECK (minutes BETWEEN 5 AND 10080),
  stack       text NOT NULL DEFAULT 'refresh' CHECK (stack IN ('refresh', 'replace')),
  enabled     boolean NOT NULL DEFAULT true,
  rev         bigint NOT NULL DEFAULT nextval('mark_kind_rev'),
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  CHECK ((art_url IS NULL) = (art_v IS NULL))
);
-- The pilots' kinds (the owners' names, 20 Nov 2026), drawn by the app's own pictures until staff upload theirs, and
-- every kind a gift on the panel's list already names (Kar Topu, Domates At on the live server; a deleted gift's kind
-- is left out), named by their word until staff name them, so every saved gift still names a kind that exists. Their
-- rev is 0: a deploy doesn't move the catalog's `v`, so no phone reads it again for them.
INSERT INTO mark_kinds (kind, name, rev) VALUES ('kaka', 'Kaka İzi', 0), ('kirik-cam', 'Kırık Cam', 0) ON CONFLICT (kind) DO NOTHING;
INSERT INTO mark_kinds (kind, name, rev) SELECT DISTINCT mark_kind, mark_kind, 0 FROM custom_gifts WHERE mark_kind IS NOT NULL AND deleted_at IS NULL ON CONFLICT (kind) DO NOTHING;

-- A mark's time in minutes (5 minutes to 7 days); NULL: the kind's, else Canlı ayarlar'. mark_hours stays written
-- (rounded up), so a server rolled back to before this keeps a mark at least that long.
ALTER TABLE custom_gifts ADD COLUMN IF NOT EXISTS mark_minutes integer CHECK (mark_minutes BETWEEN 5 AND 10080);

-- 'replaced': a newer mark of the same kind took its place (the kind's stack 'replace'; before the owners' second
-- decision of 20 Nov 2026 also another kind's, which nothing writes now).
ALTER TABLE profile_marks DROP CONSTRAINT IF EXISTS profile_marks_cleared_how_check;
ALTER TABLE profile_marks ADD CONSTRAINT profile_marks_cleared_how_check CHECK (cleared_how IN ('gift', 'admin', 'self', 'block', 'replaced'));

-- Gizlilik › "Kimler profilime iz bırakabilir": everyone, the people I follow (the default: the owners' decision, also
-- for everyone who never chose, older apps included), nobody. 'nobody' and profile_marks false ("Profilime iz
-- bırakılmasın", which older apps still switch) are kept the same (privacy.mjs); whoever turned it off already has nobody.
ALTER TABLE privacy_settings ADD COLUMN IF NOT EXISTS marks_from text NOT NULL DEFAULT 'following' CHECK (marks_from IN ('everyone', 'following', 'nobody'));
UPDATE privacy_settings SET marks_from = 'nobody' WHERE NOT profile_marks;
