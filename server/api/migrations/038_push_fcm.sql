-- Firebase push (push.mjs): a phone's own Firebase token, sent straight through Firebase Cloud Messaging; Expo
-- tokens keep going through Expo. Firebase tokens are longer than Expo's.
ALTER TABLE push_tokens ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'expo' CHECK (kind IN ('expo', 'fcm'));
ALTER TABLE push_tokens DROP CONSTRAINT IF EXISTS push_tokens_token_check;
ALTER TABLE push_tokens ADD CONSTRAINT push_tokens_token_check CHECK (char_length(token) <= 1024);
