-- Aday ajans / aktif ajans (docs/AJANS_STATUSU.md, the owners' rule of 19 Nov 2026, agency-activity.mjs).
--
-- An approved agency is a candidate until it has enough streamers and enough of them earned (Canlı ayarlar ›
-- Ajans statüsü); then it is active, and it falls back to candidate when its streamers drop below the line. A
-- candidate's commission is computed and kept, but it can't be paid out until the agency is active.
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS activity text NOT NULL DEFAULT 'candidate' CHECK (activity IN ('candidate', 'active'));
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS activity_at timestamptz;

-- The month's rule for an active agency: it brought too few new streamers last month, so its own commission share
-- is lower this month by `penalty` (a rate, 0.05 = 5 points). One row per agency and month, written once by the
-- agency job on the month's first run; the commission engine reads it for the month an income falls in.
CREATE TABLE IF NOT EXISTS agency_month_rules (
  agency_id   uuid NOT NULL REFERENCES agencies(id),
  month       date NOT NULL CHECK (extract(day FROM month) = 1),
  new_hosts   int NOT NULL CHECK (new_hosts >= 0),
  needed      int NOT NULL CHECK (needed >= 0),
  penalty     numeric(6,4) NOT NULL CHECK (penalty >= 0 AND penalty <= 1),
  decided_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (agency_id, month)
);
CREATE TRIGGER agency_month_rules_no_update BEFORE UPDATE ON agency_month_rules FOR EACH ROW EXECUTE FUNCTION agency_no_update();
CREATE TRIGGER agency_month_rules_no_delete BEFORE DELETE ON agency_month_rules FOR EACH ROW EXECUTE FUNCTION agency_no_delete();

-- What the month's rule took off a commission (the platform keeps it), for the record.
ALTER TABLE agency_commissions ADD COLUMN IF NOT EXISTS penalty_rate numeric(10,4) NOT NULL DEFAULT 0;

-- The 90-day rule's reads: a streamer's last sign-in or app use and last withdrawal.
CREATE INDEX IF NOT EXISTS sessions_user_seen ON sessions (user_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS withdrawals_user_time ON withdrawals (user_id, created_at DESC);
