-- Kimlik ve yüz doğrulaması (owners, 26 Nov 2026: "yüz doğrulamaya ihtiyacımız var"; verify.mjs, docs/YUZ_DOGRULAMA.md).
-- One row per verification session the person opened with the provider (Didit). Only the outcome is kept here: no
-- image, no face template. kind 'id': ID document + liveness + face match against the document, for taking money
-- out; kind 'face': liveness + face match against the profile photo, for the blue badge.
CREATE TABLE IF NOT EXISTS identity_checks (
  id                  bigserial PRIMARY KEY,
  user_id             uuid NOT NULL REFERENCES users(id),
  kind                text NOT NULL CHECK (kind IN ('id', 'face')),
  -- pending: opened, not finished; approved; review: staff decide (a rule flagged it, or the provider reviews it);
  -- declined; expired: abandoned or timed out.
  status              text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'review', 'declined', 'expired')),
  provider            text NOT NULL DEFAULT 'didit',
  session_id          text UNIQUE,
  session_url         text,
  -- The explicit consent this session was opened under (the text's version), when and from where.
  consent_version     text NOT NULL,
  consent_at          timestamptz NOT NULL DEFAULT now(),
  consent_ip          text,
  -- The provider's own status as last read, and why a check went to review (verify.mjs REASONS).
  provider_status     text,
  reasons             text[] NOT NULL DEFAULT '{}',
  -- kind 'id': the name on the document (a payout's account holder is compared with it), its sex (the cash-out rule
  -- depends on the account's gender), 18 or over, the issuing country, and an HMAC of country + document number (the
  -- same document on two accounts). Never the number itself, the birth date or the picture.
  doc_name            text,
  doc_sex             text CHECK (doc_sex IN ('F', 'M')),
  doc_adult           boolean,
  doc_country         text,
  doc_hash            text,
  -- kind 'face': the profile photo the face was matched against.
  avatar_url          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  decided_at          timestamptz,
  -- A staff decision (Yönetim, the panel): who and why. A provider update never overrides it.
  decided_by          uuid REFERENCES users(id),
  note                text,
  -- When the provider's copy (images, document data) was deleted: verify.mjs KEEP_DAYS after the decision, at once
  -- when consent is withdrawn or the account is deleted.
  provider_deleted_at timestamptz
);
-- At most one open session per person and kind.
CREATE UNIQUE INDEX IF NOT EXISTS identity_checks_open ON identity_checks (user_id, kind) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS identity_checks_user ON identity_checks (user_id, kind, id DESC);
CREATE INDEX IF NOT EXISTS identity_checks_doc ON identity_checks (doc_hash) WHERE doc_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS identity_checks_queue ON identity_checks (status, id DESC);
CREATE INDEX IF NOT EXISTS identity_checks_sweep ON identity_checks (decided_at) WHERE provider_deleted_at IS NULL AND session_id IS NOT NULL;

-- The profile photo whose face was verified (kind 'face' approved): the blue badge shows while avatar_url is still
-- this photo, and drops by itself when the photo changes.
ALTER TABLE users ADD COLUMN IF NOT EXISTS verified_avatar text;
-- A withdrawal's account holder compared with the name on the person's verified document (verify.mjs holderMatches):
-- true / false, null when there was no verified document. Finance staff see it before paying.
ALTER TABLE withdrawals ADD COLUMN IF NOT EXISTS holder_matches_id boolean;
