-- Diamond withdrawals (withdraw.mjs), sandbox store purchases, Google Play refunds read from the store
-- (refunds.mjs) and the sign-in code limits (auth.mjs).

-- A host asks to be paid for unlocked diamonds. The diamonds leave the balance at once (ledger row, ref =
-- the request's ref) and come back on a cancel or a rejection. The owner pays outside the app and marks the
-- request paid. `play`: asked while the server ran with play money (test top-ups or sandbox purchases), so it
-- can never be paid.
CREATE TABLE withdrawals (
  id          bigserial PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id),
  diamonds    bigint NOT NULL CHECK (diamonds > 0),
  usd         numeric(14,2) NOT NULL CHECK (usd >= 0),
  method      text NOT NULL CHECK (method IN ('iban', 'other')),
  holder      text NOT NULL CHECK (char_length(holder) BETWEEN 3 AND 80),
  account     text NOT NULL CHECK (char_length(account) BETWEEN 5 AND 120),
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'rejected', 'cancelled')),
  play        boolean NOT NULL DEFAULT false,
  ref         text NOT NULL CHECK (char_length(ref) <= 64),
  note        text NOT NULL DEFAULT '' CHECK (char_length(note) <= 300),
  decided_by  uuid REFERENCES users(id),
  decided_at  timestamptz,
  ip          text NOT NULL DEFAULT '' CHECK (char_length(ip) <= 64),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, ref)
);
-- One open request per person.
CREATE UNIQUE INDEX withdrawals_one_pending ON withdrawals(user_id) WHERE status = 'pending';
CREATE INDEX withdrawals_status ON withdrawals(status, created_at);
CREATE INDEX withdrawals_user ON withdrawals(user_id, created_at DESC);

-- A store test purchase (Google Play test or promo, App Store sandbox), credited only with
-- ALLOW_SANDBOX_PURCHASES=1 and then as play money.
ALTER TABLE purchases ADD COLUMN sandbox boolean NOT NULL DEFAULT false;

-- Every sign-in code sent, for the hourly cap over all numbers (OTP_GLOBAL_PER_HOUR).
CREATE TABLE otp_sends (
  id      bigserial PRIMARY KEY,
  phone   text NOT NULL,
  ip      text NOT NULL DEFAULT '',
  sent_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX otp_sends_time ON otp_sends(sent_at);

-- Wrong codes for the store review number (its code never changes, so it locks after a few misses).
CREATE TABLE otp_review_lock (
  phone        text PRIMARY KEY,
  fails        int NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz
);

-- Google Play voided purchases: how far the poll has read (store time, ms).
CREATE TABLE store_refund_sync (
  store       text PRIMARY KEY,
  cursor_ms   bigint NOT NULL DEFAULT 0,
  last_ok_at  timestamptz,
  last_error  text
);
