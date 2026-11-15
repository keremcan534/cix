-- Gift videos made from an SVGA at the old default size, 60 % of the width (before "Tam ekran" became the default;
-- the panel showed the size only low in the form and never for a video already made): made full screen once, from
-- the video itself, since the SVGA was deleted after converting (custom-gifts.mjs enlargeOld). The mark is the video's
-- address now: a video replaced since is never touched, and the job measures each and leaves one that isn't that size.
ALTER TABLE custom_gifts ADD COLUMN video_enlarge text;
UPDATE custom_gifts SET video_enlarge = video_url
 WHERE video_url IS NOT NULL AND deleted_at IS NULL AND (job_fill IS NULL OR job_fill = 0.60);
