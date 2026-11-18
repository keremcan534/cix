-- Mesajlar's preferences (privacy.mjs): which calls I take and which messages show a notification on my phone.
-- Every choice starts on, as the owners decided (18 Nov 2026).
ALTER TABLE privacy_settings
  ADD COLUMN IF NOT EXISTS voice_calls boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS video_calls boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS message_push boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS push_close_only boolean NOT NULL DEFAULT true;
