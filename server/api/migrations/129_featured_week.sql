-- Öne çıkanlar (owners, 25 Nov 2026; social.mjs FEATURED_SCORES): the week's messages and calls by time. Gifts
-- already have gift_events_time (004).
CREATE INDEX IF NOT EXISTS messages_created ON messages (created_at);
CREATE INDEX IF NOT EXISTS calls_started ON calls (started_at) WHERE started_at IS NOT NULL;
