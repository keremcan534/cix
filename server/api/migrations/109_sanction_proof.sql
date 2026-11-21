-- Güncelleme 8, madde 9: a sanction given without evidence (no proof attached, not from a report) by anyone but a
-- Süper yönetici waits for a Süper yönetici's approval (sanctions.mjs). `needs_super` marks those; only a Süper
-- yönetici approves or rejects them. A screenshot (its link) is a kind of evidence of its own.
ALTER TABLE user_sanctions ADD COLUMN IF NOT EXISTS needs_super boolean NOT NULL DEFAULT false;
ALTER TABLE moderation_evidence DROP CONSTRAINT IF EXISTS moderation_evidence_kind_check;
ALTER TABLE moderation_evidence ADD CONSTRAINT moderation_evidence_kind_check CHECK (kind IN ('note', 'link', 'report', 'message', 'screenshot'));
