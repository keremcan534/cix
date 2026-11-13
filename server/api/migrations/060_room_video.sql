-- Ortak ekran (Video and Sinema Salonu layouts, room-video.mjs): the room's one YouTube video, shared by every
-- phone in the room through the LiveKit metadata. { videoId, status, position, updatedAt, by }; null = no video.
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS video jsonb;
