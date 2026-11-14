-- Yönetim › Hediyeler (custom-gifts.mjs, docs/HEDIYE_YONETIMI.md): gifts the admins add from the panel, without an
-- app update. Ids are 'a' and a number from custom_gift_ids, never reused (the compiled gifts, catalog.mjs GIFT_ROWS,
-- never start with 'a'). `rev` takes the next custom_gift_rev on every change a phone should see: the largest one is
-- added to the live settings' version in the catalog and /api/config, so phones read the catalog again.
-- A deleted gift keeps its row (deleted_at, its files gone): gift_events, the ledger and Şanslı çanta still name it.
-- Files are storage addresses (media.mjs kinds gifticon, giftvideo, giftsource): the icon, the stacked video in effect
-- (video_*, its size, length and content version for the phones' fx list), and the job that turns an uploaded
-- transparent source into a stacked video (job_*), which keeps the video in effect until it is done.
CREATE SEQUENCE IF NOT EXISTS custom_gift_ids;
CREATE SEQUENCE IF NOT EXISTS custom_gift_rev;

CREATE TABLE IF NOT EXISTS custom_gifts (
  id          text PRIMARY KEY CHECK (id ~ '^a[0-9]{1,9}$'),
  name        text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 24),
  emoji       text NOT NULL DEFAULT '🎁' CHECK (char_length(emoji) BETWEEN 1 AND 16),
  price       integer NOT NULL CHECK (price BETWEEN 1 AND 1000000),
  cat         text NOT NULL CHECK (cat IN ('hot', 'couple', 'gameplay', 'privilege')),
  min_svip    smallint NOT NULL DEFAULT 0 CHECK (min_svip BETWEEN 0 AND 10),
  -- Its place on its shelf: lower first; the admins' gifts come before the compiled ones.
  sort        integer NOT NULL DEFAULT 0,
  enabled     boolean NOT NULL DEFAULT true,
  icon_url    text NOT NULL CHECK (char_length(icon_url) <= 500),
  video_url   text CHECK (char_length(video_url) <= 500),
  video_bytes integer CHECK (video_bytes > 0),
  video_ms    integer CHECK (video_ms >= 0),
  video_v     text CHECK (video_v ~ '^[0-9a-f]{12}$'),
  job_status  text CHECK (job_status IN ('processing', 'failed')),
  job_source  text CHECK (char_length(job_source) <= 500),
  job_error   text CHECK (char_length(job_error) <= 300),
  job_tries   smallint NOT NULL DEFAULT 0,
  -- When the job may run (again): a try cut off by the storage or a restart waits a little longer each time.
  job_at      timestamptz NOT NULL DEFAULT now(),
  -- An SVGA's size on the screen: the share of the frame's width its visible part takes (svga-to-fx.py --fill).
  job_fill    numeric(3, 2) CHECK (job_fill IN (0.45, 0.60, 0.80, 1.00)),
  rev         bigint NOT NULL DEFAULT nextval('custom_gift_rev'),
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  CHECK ((video_url IS NULL) = (video_v IS NULL) AND (video_url IS NULL) = (video_bytes IS NULL))
);
-- One name per gift on the shelves (deleted ones aside); custom-gifts.mjs also keeps clear of the compiled names.
CREATE UNIQUE INDEX IF NOT EXISTS custom_gifts_name ON custom_gifts (lower(name)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS custom_gifts_jobs ON custom_gifts (updated_at) WHERE job_status = 'processing';
-- How often each was sent (the panel's list): only the admins' gifts, so the index stays small.
CREATE INDEX IF NOT EXISTS gift_events_custom ON gift_events (gift_id) WHERE gift_id LIKE 'a%';
