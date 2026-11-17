-- Yönetim › Mağaza (shop-items.mjs, docs/MAGAZA_YONETIMI.md): the shop's profile frames and entry effects, changed and
-- added from the finance panel without an app update.
--   - The app's own (catalog.mjs SHOP, kinds frame and entry, their sku as id, builtin) have a row once something about
--     them changed: every NULL column is "as in the app"; the row is never deleted.
--   - The admins' own frames ('sf' and a number) and entry effects ('se' and a number) are rows of their own: a frame's
--     picture (art_*, hole: the empty centre's radius as a share of its width), an entry effect's video (video_*, made
--     from an uploaded source by the job, job_*, as custom_gifts' gift videos) and its name plate (plate: where the
--     entering person's name is written over it).
-- days: 0 is for good (an app's item: NULL is the app's own length).
CREATE SEQUENCE shop_item_rev;
CREATE SEQUENCE shop_item_no;
CREATE TABLE shop_items (
  id          text PRIMARY KEY CHECK (id ~ '^[a-z][a-z0-9-]{1,31}$'),
  builtin     boolean NOT NULL DEFAULT false,
  kind        text NOT NULL CHECK (kind IN ('frame', 'entry')),
  name        text CHECK (char_length(name) BETWEEN 2 AND 24),
  price       integer CHECK (price BETWEEN 1 AND 10000000),
  days        integer CHECK (days BETWEEN 0 AND 365),
  min_vip     smallint CHECK (min_vip BETWEEN 0 AND 15),
  enabled     boolean,
  sort        integer,
  art_url     text CHECK (char_length(art_url) <= 500),
  art_px      integer CHECK (art_px BETWEEN 64 AND 4096),
  hole        numeric(4, 3) CHECK (hole BETWEEN 0.1 AND 0.45),
  video_url   text CHECK (char_length(video_url) <= 500),
  video_bytes integer CHECK (video_bytes > 0),
  video_ms    integer CHECK (video_ms >= 0),
  video_v     text CHECK (video_v ~ '^[0-9a-f]{12}$'),
  plate       jsonb,
  job_status  text CHECK (job_status IN ('processing', 'failed')),
  job_source  text CHECK (char_length(job_source) <= 500),
  job_error   text CHECK (char_length(job_error) <= 300),
  job_tries   smallint NOT NULL DEFAULT 0,
  job_at      timestamptz NOT NULL DEFAULT now(),
  job_fill    numeric(3, 2) CHECK (job_fill IN (0.45, 0.60, 0.80, 1.00)),
  job_opaque  boolean NOT NULL DEFAULT false,
  job_preview text CHECK (char_length(job_preview) <= 500),
  deleted_at  timestamptz,
  rev         bigint NOT NULL DEFAULT nextval('shop_item_rev'),
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK ((video_url IS NULL) = (video_v IS NULL) AND (video_url IS NULL) = (video_bytes IS NULL)),
  CHECK (builtin OR (name IS NOT NULL AND price IS NOT NULL AND days IS NOT NULL AND min_vip IS NOT NULL AND enabled IS NOT NULL AND sort IS NOT NULL)),
  CHECK (NOT builtin OR (art_url IS NULL AND video_url IS NULL AND job_status IS NULL AND plate IS NULL))
);
CREATE UNIQUE INDEX shop_items_name ON shop_items (kind, lower(name)) WHERE NOT builtin AND deleted_at IS NULL;
CREATE INDEX shop_items_jobs ON shop_items (job_at) WHERE job_status = 'processing';
