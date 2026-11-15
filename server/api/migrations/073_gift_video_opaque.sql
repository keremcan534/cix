-- A gift video the admin chose to play full screen with its background (a scene, no transparency): its conversion
-- doesn't refuse it for having nowhere transparent (custom-gifts.mjs convertJob, the panel's "Arka planlı tam ekran").
ALTER TABLE custom_gifts ADD COLUMN job_opaque boolean NOT NULL DEFAULT false;
