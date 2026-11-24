-- Yayıncı haftalık bonusu (owners, 24 Nov 2026; host-bonus.mjs): every Monday 00:00 Türkiye time the week that ended is
-- closed once (host_bonus_runs), and each streamer of an agency or of the centre (kind: the yönetim yayıncısı, no
-- agency) who reached a tier gets its bonus in diamonds, one row each
-- (host_bonuses). A week the setting was off for is written skipped (is_on false), and staff may pay it later. done_at
-- is set once every bonus of the week went in; a start finds a week not done and finishes it (the rows' refs keep
-- anyone from being paid twice). Staff may take a bonus back (reversed_*): what of it is still on the account returns.
CREATE TABLE host_bonus_runs (
  week_start date PRIMARY KEY,
  ran_at     timestamptz NOT NULL DEFAULT now(),
  done_at    timestamptz,
  is_on      boolean NOT NULL,
  paid_by    uuid REFERENCES users(id),
  people     int NOT NULL DEFAULT 0,
  diamonds   bigint NOT NULL DEFAULT 0,
  tiers      jsonb NOT NULL
);

CREATE TABLE host_bonuses (
  id              bigserial PRIMARY KEY,
  user_id         uuid NOT NULL REFERENCES users(id),
  week_start      date NOT NULL REFERENCES host_bonus_runs(week_start),
  kind            text NOT NULL CHECK (kind IN ('agency', 'management')),
  agency_id       uuid REFERENCES agencies(id) CHECK ((kind = 'agency') = (agency_id IS NOT NULL)),
  earned          bigint NOT NULL CHECK (earned >= 0),
  tier_from       bigint NOT NULL CHECK (tier_from > 0),
  bonus           bigint NOT NULL CHECK (bonus > 0),
  ref             text NOT NULL UNIQUE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  reversed_at     timestamptz,
  reversed_by     uuid REFERENCES users(id),
  reversed_amount bigint CHECK (reversed_amount IS NULL OR reversed_amount >= 0),
  reverse_reason  text CHECK (reverse_reason IS NULL OR char_length(reverse_reason) <= 300),
  UNIQUE (user_id, week_start)
);
CREATE INDEX host_bonuses_week ON host_bonuses(week_start, bonus DESC);
