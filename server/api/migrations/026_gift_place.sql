-- Where a gift was sent outside a room, so Gelir can show each source (wallet.mjs GET /api/wallet/income):
-- a chat, a moment (Anlar) or a profile. NULL with a room = a room gift; NULL without one = an older gift.
ALTER TABLE gift_events ADD COLUMN IF NOT EXISTS place text CHECK (place IN ('chat', 'moment', 'profile'));
