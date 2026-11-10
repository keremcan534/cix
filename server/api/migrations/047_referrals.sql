-- Arkadaşını Getir (referrals.mjs): each person's own invite code, made the first time they open Davet, and who
-- entered whose code. One row per invitee account (the primary key), so an account is rewarded at most once. Both
-- go with the account of either person (eraseAccount); the coins already paid stay in the ledger as accounting
-- records, without names.
CREATE TABLE IF NOT EXISTS referral_codes (
  user_id    uuid PRIMARY KEY REFERENCES users(id),
  code       text NOT NULL UNIQUE CHECK (code ~ '^SIMI-[A-Z0-9]{6}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS referrals (
  invitee_id uuid PRIMARY KEY REFERENCES users(id),
  inviter_id uuid NOT NULL REFERENCES users(id),
  -- pending: waiting for the invitee's first room (or a day under the inviter's daily cap); paid: both got `coins`;
  -- refused: no reward, for `reason` (device: the invitee's phone had another account; blocked: one blocked the
  -- other); revoked: staff took the coins back (a fake account).
  status     text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'refused', 'revoked')),
  reason     text CHECK (reason IN ('device', 'blocked', 'staff')),
  coins      integer NOT NULL DEFAULT 0 CHECK (coins >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- When it was paid (the inviter's daily cap counts these; a revoke keeps it) or refused.
  settled_at timestamptz,
  CHECK (invitee_id <> inviter_id)
);
CREATE INDEX IF NOT EXISTS referrals_inviter ON referrals (inviter_id, created_at DESC);
