-- Abonelik (the VIP subscription) through the stores (vip.mjs). One row per store subscription: Google Play's purchase
-- token (it stays the same across renewals), the App Store's original transaction id, or the test transaction id
-- (ALLOW_TEST_TOPUP=1), unique per platform, so one subscription is never counted for two accounts. `expires_at` is
-- what the store said last (a renewal moves it on; a test purchase stacks its days on the current end); `state`
-- 'revoked' is a refund or revocation, final. `test`: nobody paid (a test purchase, a license tester, App Store
-- sandbox). Rows are never deleted: they are the record of what was sold, like purchases.
CREATE TABLE IF NOT EXISTS vip_subscriptions (
  id            bigserial PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES users(id),
  platform      text NOT NULL CHECK (platform IN ('ios', 'android', 'test')),
  product_id    text NOT NULL CHECK (char_length(product_id) <= 64),
  store_ref     text NOT NULL CHECK (char_length(store_ref) BETWEEN 1 AND 500),
  -- The store's latest order (Google latestOrderId, Apple transactionId): what Play Console or support shows.
  order_id      text CHECK (char_length(order_id) <= 200),
  expires_at    timestamptz NOT NULL,
  -- Whether the store renews it on its own; null when the store didn't say (an App Store transaction).
  auto_renewing boolean,
  state         text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'revoked')),
  test          boolean NOT NULL DEFAULT false,
  -- When the store was last asked about it (the renewal check reads a token again at most every few minutes).
  checked_at    timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, store_ref)
);
CREATE INDEX IF NOT EXISTS vip_subscriptions_user ON vip_subscriptions (user_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS vip_subscriptions_renewal ON vip_subscriptions (expires_at) WHERE platform = 'android' AND state = 'active';

-- The person's subscription end: the latest expires_at of their rows that aren't revoked, kept in step by vip.mjs
-- (syncUntil) whenever a row changes, so every check (Profiline bakanlar, Seviyeleri gizle) reads it off the account.
ALTER TABLE users ADD COLUMN IF NOT EXISTS vip_sub_until timestamptz;
