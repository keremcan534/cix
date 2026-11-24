-- Ajans seviyeleri (owners, 24 Nov 2026; agency-levels.mjs, agency-level-rules.mjs). An agency's commission is set by
-- its week: each income is written at level 0's rate (level_week: the week it waits on), and when the week closes
-- (Monday 00:00 Türkiye) the level reached adds the rest in one 'level' row per period (and the assistant's and the
-- BD's part of it). agency_level_weeks keeps each agency's week once; agency_level_runs each week's close.
ALTER TABLE agency_commissions ADD COLUMN level_week date;
CREATE INDEX agency_commissions_level_week ON agency_commissions(agency_id, level_week) WHERE level_week IS NOT NULL;
CREATE INDEX agency_commissions_occurred ON agency_commissions(occurred_at);

CREATE TABLE agency_level_runs (
  week_start date PRIMARY KEY,
  ran_at     timestamptz NOT NULL DEFAULT now(),
  done_at    timestamptz,
  agencies   int NOT NULL DEFAULT 0
);

CREATE TABLE agency_level_weeks (
  agency_id   uuid NOT NULL REFERENCES agencies(id),
  week_start  date NOT NULL,
  level_key   text NOT NULL,
  level_name  text NOT NULL,
  shown       boolean NOT NULL,
  rate        numeric(6,4) NOT NULL,
  base        bigint NOT NULL,
  active      int NOT NULL,
  -- 'new' (its first weeks), 'threshold' (the week's diamonds), 'active' (too few active streamers: level 0).
  reason      text NOT NULL CHECK (reason IN ('new', 'threshold', 'active')),
  adjustment  numeric(20,4) NOT NULL DEFAULT 0,
  settled_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (agency_id, week_start)
);
CREATE INDEX agency_level_weeks_week ON agency_level_weeks(week_start);

-- The level shown on the agency's cards: the last closed week's.
ALTER TABLE agencies ADD COLUMN level_key text;
ALTER TABLE agencies ADD COLUMN level_week date;

ALTER TABLE agency_ledger DROP CONSTRAINT agency_ledger_kind_check;
ALTER TABLE agency_ledger ADD CONSTRAINT agency_ledger_kind_check CHECK (kind IN ('direct', 'difference', 'transition', 'transfer_fee', 'adjustment', 'reversal', 'assistant', 'level'));

-- The BD's part of a week's level row has no single commission.
ALTER TABLE bd_ledger ALTER COLUMN commission_id DROP NOT NULL;
ALTER TABLE bd_ledger ADD COLUMN ref text UNIQUE;

-- A streamer dropped from an agency for being inactive (60 days offline) gets the days to pick an agency again from
-- when she comes back (agency-activity.mjs marks it); past them she is a yönetim yayıncısı (streamer-rule.mjs).
ALTER TABLE agency_streamers ADD COLUMN returned_at timestamptz;
