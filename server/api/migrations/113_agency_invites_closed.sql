-- Ajans daveti kapandı (owners, 22 Nov 2026): agencies no longer invite streamers; a streamer joins with the
-- agency's code or invite link. The invites still waiting are cancelled (no notice goes to the streamers).
UPDATE agency_requests SET status = 'cancelled', decided_at = now() WHERE kind = 'invite' AND status = 'pending';
