-- Mesajlar (owners, 27 Nov 2026): a message can answer another (reply_to, quoted over it); its writer can take it back
-- within 2 minutes (retracted_at: kept for moderation, shown to nobody); an approved streamer's paid photo
-- (paid_price coins, opened by the recipient within paid_until, else gone; paid_opened_at when paid for).
ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to bigint REFERENCES messages(id) ON DELETE SET NULL;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS retracted_at timestamptz;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS paid_price integer CHECK (paid_price IS NULL OR paid_price > 0);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS paid_until timestamptz;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS paid_opened_at timestamptz;
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_paid_photo;
ALTER TABLE messages ADD CONSTRAINT messages_paid_photo CHECK (paid_price IS NULL OR (image_url IS NOT NULL AND paid_until IS NOT NULL));
