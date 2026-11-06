-- Sign in with an e-mail code (auth.mjs POST /api/auth/email/*) and phone verification while signed in
-- (/api/me/phone/*, by SMS or WhatsApp). (015 is reserved for the live settings.)

-- An e-mail address is a sign-in identity like a Google account: subject = the address as normalizeEmail
-- gives it (lower case), kept in email as well. PK (provider, subject): one account per address;
-- UNIQUE (provider, user_id): one address per account. lower(email) finds the Google account with an address.
ALTER TABLE auth_identities DROP CONSTRAINT auth_identities_provider_check;
ALTER TABLE auth_identities ADD CONSTRAINT auth_identities_provider_check CHECK (provider IN ('google', 'email'));
ALTER TABLE auth_identities ADD CONSTRAINT auth_identities_email_subject CHECK (provider <> 'email' OR (email = subject AND subject = lower(subject)));
CREATE INDEX auth_identities_email_lower ON auth_identities (lower(email));

-- One code table for both channels, one row per request: start answers a random `challenge` (only its hash is
-- kept here) and verify must send it back, so nobody else can replace or use up someone's code by asking for
-- one at the same address or number. target is the phone number (sms) or the address (email); ip the
-- connection it was asked from (IPv6 by /64), for the 60-second wait. Codes are good for minutes, so codes
-- still open when this runs are simply dropped.
DROP TABLE otp_codes;
CREATE TABLE otp_codes (
  challenge_hash text PRIMARY KEY,
  channel        text NOT NULL CHECK (channel IN ('sms', 'email')),
  target         text NOT NULL,
  code_hash      text NOT NULL,
  ip             text NOT NULL DEFAULT '',
  attempts       int NOT NULL DEFAULT 0,
  sent_at        timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL
);
CREATE INDEX otp_codes_target ON otp_codes (channel, target, sent_at);
CREATE INDEX otp_codes_expiry ON otp_codes (expires_at);

-- Wrong codes over a day, whichever code they were for (auth.mjs countFailure): key is a hash of channel +
-- target, or of channel + target + connection. Too many lock that key (locked_until).
CREATE TABLE otp_failures (
  key          text PRIMARY KEY,
  fails        int NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz
);
CREATE INDEX otp_failures_time ON otp_failures (window_start);

-- Codes sent, for the hourly caps per channel, per target and per IP. For e-mail, target is a hash of the
-- address without its +tag (and, for Gmail, its dots), never the address itself: it is only counted.
ALTER TABLE otp_sends RENAME COLUMN phone TO target;
ALTER TABLE otp_sends ADD COLUMN channel text NOT NULL DEFAULT 'sms' CHECK (channel IN ('sms', 'email'));
CREATE INDEX otp_sends_channel_time ON otp_sends (channel, sent_at);
CREATE INDEX otp_sends_ip_time ON otp_sends (ip, sent_at);

-- The store review number / address with a fixed code: wrong codes lock it for an hour.
ALTER TABLE otp_review_lock RENAME COLUMN phone TO target;
ALTER TABLE otp_review_lock ADD COLUMN channel text NOT NULL DEFAULT 'sms' CHECK (channel IN ('sms', 'email'));
ALTER TABLE otp_review_lock DROP CONSTRAINT otp_review_lock_pkey;
ALTER TABLE otp_review_lock ADD PRIMARY KEY (channel, target);

-- The free daily quota each mail provider has used (mail.mjs), per UTC day.
CREATE TABLE mail_quota (
  provider text NOT NULL,
  day      date NOT NULL,
  sent     int NOT NULL DEFAULT 0 CHECK (sent >= 0),
  PRIMARY KEY (provider, day)
);

-- WhatsApp phone check (whatsapp.mjs): the person sends "SC-XXXXXX" to our number, Meta's signed webhook tells
-- us which number sent it. Only a hash of the nonce is kept, and no number: a verified one is on the account
-- (users.phone). Claims older than a day are swept (auth.mjs startOtpSweep).
CREATE TABLE phone_claims (
  nonce_hash text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id),
  expires_at timestamptz NOT NULL,
  result     text CHECK (result IN ('verified', 'taken', 'country', 'no_number')),
  done_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX phone_claims_user ON phone_claims (user_id, created_at DESC);
CREATE INDEX phone_claims_time ON phone_claims (created_at);

-- "+90 0532…" used to be kept with the trunk 0 (+900532…), a second form of the same number. Rewritten to
-- +90532… unless that form is already some account's number (then both stay, and staff can sort it out).
UPDATE users u SET phone = '+90' || substr(u.phone, 5)
 WHERE u.phone ~ '^\+900[1-9][0-9]{9}$' AND NOT EXISTS (SELECT 1 FROM users x WHERE x.phone = '+90' || substr(u.phone, 5));
