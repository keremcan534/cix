-- Bağlar, Güncelleme 7 (bonds.mjs, bond-life.mjs, docs/BAGLAR.md): points drop each night after a day with no gift
-- either way, a bond nobody gifts for days ends by itself, the levels go to Lv20, and every change of a bond is told in
-- Mesajlar › SimilarClub Sistem. score = max(0, gift_coins / 100 + talk_points - points_lost).
--   - points_lost: what the nights took so far (never more than the points there were).
--   - gift_day: the last Türkiye day either of the two sent the other a gift (the accept day to begin with); a night
--     after such a day costs nothing, and bond_idle_end_days days without one end the bond.
--   - decayed_on: the Türkiye day the nightly drop was last worked out for the bond (once a day).
--   - level: the level of the points with the steps of the last write (Canlı ayarlar bond_levels); level_said: the one
--     both people were last told of, level_seq: how many level notices went (their refs).
--   - idle_warned: the gift_day an "it ends soon" warning went for (once per quiet stretch).
--   - told_status: the status both people were last told of (the notices are written after the change is committed).
--   - end_reason: why an ended bond ended when nobody ended it: 'idle' (no gift for days; no cooldown after it),
--     'gone' (an account was deleted); a request ended by a store refund ('withdrawn'): 'refund'. NULL: a person did.
ALTER TABLE bonds
  ADD COLUMN IF NOT EXISTS points_lost bigint NOT NULL DEFAULT 0 CHECK (points_lost >= 0),
  ADD COLUMN IF NOT EXISTS gift_day date,
  ADD COLUMN IF NOT EXISTS decayed_on date,
  ADD COLUMN IF NOT EXISTS level int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS level_said int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS level_seq int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS idle_warned date,
  ADD COLUMN IF NOT EXISTS told_status text,
  ADD COLUMN IF NOT EXISTS end_reason text CHECK (end_reason IN ('idle', 'gone', 'refund'));

-- The bonds of today start their quiet-day count now (their rules said "points never drop" until this update), and
-- nobody is told of a level or a status they already have.
UPDATE bonds SET gift_day = (now() AT TIME ZONE 'Europe/Istanbul')::date WHERE status = 'active' AND gift_day IS NULL;
UPDATE bonds SET level = (SELECT count(*)::int FROM unnest(ARRAY[0, 10, 30, 60, 100, 200, 400, 700, 1200, 2000, 3000, 4500, 6500, 9000, 12000, 16000, 21000, 27000, 35000, 45000]::bigint[]) t
                          WHERE t <= gift_coins / 100 + talk_points)
 WHERE status = 'active';
UPDATE bonds SET level_said = level, told_status = status;

-- The nightly pass (active bonds not worked out today), the quiet ones to warn, the notices still to write, and the
-- room's bubble (a person's Lv10+ bond, partner anywhere: bonds.mjs among).
CREATE INDEX IF NOT EXISTS bonds_decay ON bonds (decayed_on) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS bonds_quiet ON bonds (gift_day) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS bonds_level_news ON bonds (id) WHERE status = 'active' AND level <> level_said;
CREATE INDEX IF NOT EXISTS bonds_status_news ON bonds (id) WHERE told_status IS DISTINCT FROM status;
CREATE INDEX IF NOT EXISTS bonds_top_a ON bonds (a) WHERE status = 'active' AND level >= 10;
CREATE INDEX IF NOT EXISTS bonds_top_b ON bonds (b) WHERE status = 'active' AND level >= 10;
