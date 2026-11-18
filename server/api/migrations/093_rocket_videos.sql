-- Oda roketi: the video each of the five levels plays when it launches (Hediye ve mağaza › Oda roketi). An SVGA, a
-- transparent WebM or MOV is turned into the phones' stacked video by the same job as a gift's (custom-gifts.mjs).
CREATE SEQUENCE IF NOT EXISTS room_rocket_video_rev;
CREATE TABLE IF NOT EXISTS room_rocket_videos (
  id          text PRIMARY KEY CHECK (id ~ '^rocket-[1-5]$'),
  video_url   text CHECK (char_length(video_url) <= 500),
  video_bytes integer CHECK (video_bytes > 0),
  video_ms    integer CHECK (video_ms >= 0),
  video_v     text CHECK (video_v ~ '^[0-9a-f]{12}$'),
  job_status  text CHECK (job_status IN ('processing', 'failed')),
  job_source  text CHECK (char_length(job_source) <= 500),
  job_error   text CHECK (char_length(job_error) <= 300),
  job_tries   smallint NOT NULL DEFAULT 0,
  job_at      timestamptz NOT NULL DEFAULT now(),
  job_fill    numeric(3, 2) CHECK (job_fill IN (0.45, 0.60, 0.80, 1.00)),
  job_opaque  boolean NOT NULL DEFAULT false,
  job_preview text CHECK (char_length(job_preview) <= 500),
  deleted_at  timestamptz,
  rev         bigint NOT NULL DEFAULT nextval('room_rocket_video_rev'),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK ((video_url IS NULL) = (video_v IS NULL) AND (video_url IS NULL) = (video_bytes IS NULL))
);
CREATE INDEX IF NOT EXISTS room_rocket_videos_jobs ON room_rocket_videos (job_at) WHERE job_status = 'processing';
