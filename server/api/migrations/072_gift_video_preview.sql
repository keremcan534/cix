-- A gift video refused after converting (nothing in it transparent) keeps what came out, so the panel can show it
-- (custom-gifts.mjs convertJob, "Önizle"). Its file goes with the gift's next video, a reset or the gift.
ALTER TABLE custom_gifts ADD COLUMN job_preview text;
