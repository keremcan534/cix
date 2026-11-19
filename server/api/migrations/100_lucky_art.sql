-- Şanslı hediye (lucky.mjs, docs/LUCKY_HEDIYE.md): each package's own icon and video, set in the panel (Hediye ve
-- mağaza › Şanslı hediye ayarı, lucky-art.mjs). One row per package id (lk1–lk4 and the admins' new ones); the
-- package's name, emoji, price, odds and on/off stay in lucky_config. Kept apart from custom_gifts on purpose: no
-- gift route (giftOf, the catalog's gifts) ever reads this table, so a package can't be sent as a plain gift. The
-- icon is an uploaded gift icon (media.mjs gifticon); the video a ready stacked MP4 or a source turned into one by the
-- gifts' converter (custom-gifts.mjs addVideoTable: the video_* and job_* columns are the ones it writes).
CREATE SEQUENCE IF NOT EXISTS lucky_art_rev;
CREATE TABLE IF NOT EXISTS lucky_art (
  id          text PRIMARY KEY CHECK (id ~ '^lk[a-z0-9]{1,20}$'),
  icon_url    text CHECK (char_length(icon_url) <= 500),
  icon_link   text CHECK (char_length(icon_link) <= 2000),
  video_link  text CHECK (char_length(video_link) <= 2000),
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
  -- Never set by the panel (a package's art is taken off, not deleted); the converter's queries expect the column.
  deleted_at  timestamptz,
  rev         bigint NOT NULL DEFAULT nextval('lucky_art_rev'),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK ((video_url IS NULL) = (video_v IS NULL) AND (video_url IS NULL) = (video_bytes IS NULL))
);
CREATE INDEX IF NOT EXISTS lucky_art_jobs ON lucky_art (job_at) WHERE job_status = 'processing';
