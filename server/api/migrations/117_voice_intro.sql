-- Ses tanıtımı (owners, 24 Nov 2026): a voice clip of up to 15 seconds on someone's profile (voice-intro.mjs).
-- voice_url: the stored file (media.mjs kind 'voice'); voice_ms: its length the server read from it; voice_at: when
-- it was saved. All three are cleared together (their own removal, staff's, the account's deletion).
ALTER TABLE users
  ADD COLUMN voice_url text,
  ADD COLUMN voice_ms integer CHECK (voice_ms IS NULL OR voice_ms BETWEEN 0 AND 60000),
  ADD COLUMN voice_at timestamptz;
