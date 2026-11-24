-- VIP aylık değerlendirme (owners, 24 Nov 2026; vip-month.mjs). Every VIP point that comes or goes is written with its
-- time (vip_points), so a month's points are exact. Each VIP account has its period: from vip_period_start to
-- vip_eval_at (the next 1st 00:00 Türkiye, later if a protection period was bought), the level it started at, whether
-- it is the first VIP month (not evaluated) and how many months in a row it missed its keep amount.
CREATE TABLE vip_points (
  id         bigserial PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount     bigint NOT NULL CHECK (amount <> 0),
  -- 'store', 'jeton_noktasi', 'admin_load', 'store_refund', 'admin_reverse'
  source     text NOT NULL CHECK (char_length(source) <= 30),
  ref        text,
  at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX vip_points_user_at ON vip_points(user_id, at);

ALTER TABLE users ADD COLUMN vip_period_start timestamptz;
ALTER TABLE users ADD COLUMN vip_eval_at timestamptz;
ALTER TABLE users ADD COLUMN vip_period_level smallint NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN vip_first boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN vip_misses smallint NOT NULL DEFAULT 0;
-- The period a protection period was bought for (one per period).
ALTER TABLE users ADD COLUMN vip_extended_for timestamptz;
CREATE INDEX users_vip_eval ON users(vip_eval_at) WHERE vip_eval_at IS NOT NULL;

-- Each month's decision.
CREATE TABLE vip_evaluations (
  id            bigserial PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_start  timestamptz NOT NULL,
  eval_at       timestamptz NOT NULL,
  level_start   int NOT NULL,
  level_end     int NOT NULL,
  period_points bigint NOT NULL,
  keep_points   bigint NOT NULL,
  -- 'first' (first VIP month, carried on), 'upgraded', 'kept', 'dropped' (one level), 'lost' (second month in a row)
  result        text NOT NULL CHECK (result IN ('first', 'upgraded', 'kept', 'dropped', 'lost')),
  level_after   int NOT NULL,
  misses        int NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, eval_at)
);

-- Yükseltme koruma dönemi: the evaluation put off for coins.
CREATE TABLE vip_extensions (
  id           bigserial PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_start timestamptz NOT NULL,
  eval_before  timestamptz NOT NULL,
  eval_after   timestamptz NOT NULL,
  days         int NOT NULL CHECK (days > 0),
  price        bigint NOT NULL CHECK (price > 0),
  ref          text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, period_start)
);

-- The VIP accounts of today: their period starts now and, as the rule began this month, this month is their first
-- (not evaluated; its points carry to next month's end).
UPDATE users SET vip_period_start = now(), vip_first = true, vip_period_level = 0,
       vip_eval_at = (date_trunc('month', now() AT TIME ZONE 'Europe/Istanbul') + interval '1 month') AT TIME ZONE 'Europe/Istanbul'
 WHERE svip_xp > 0 AND deleted_at IS NULL;
