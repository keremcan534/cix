-- Yönetim › Emojiler (emoji.mjs, docs/EMOJI_YONETIMI.md): the emoji panel's sticker packs and their stickers, changed
-- and added from the panel without an app update. A row whose id is one of the app's (stickers.mjs: duygu, vip-tac, …)
-- holds only what was changed about it, every NULL column "as in the app", and is never deleted, so its rev stays (the
-- phones' catalog version only grows). The admins' own packs ('ep' and a number) and stickers ('es' and a number) keep
-- every column filled; a deleted one keeps its row (deleted_at) for the messages that show it. `rev` takes the next
-- emoji_rev on every change a phone should see: the largest is added to the catalog's and /api/config's version.
CREATE SEQUENCE IF NOT EXISTS emoji_rev;
CREATE SEQUENCE IF NOT EXISTS emoji_ids;

CREATE TABLE IF NOT EXISTS emoji_packs (
  id         text PRIMARY KEY,
  builtin    boolean NOT NULL DEFAULT false,
  name       text CHECK (char_length(name) BETWEEN 2 AND 24),
  -- Coins in the shop ('pack-<id>'); 0: free, or opened by its VIP level alone.
  price      integer CHECK (price BETWEEN 0 AND 1000000),
  min_vip    smallint CHECK (min_vip BETWEEN 0 AND 15),
  -- false: off the emoji panel and the shop (the app's `retired`); its stickers still draw where they were sent.
  enabled    boolean,
  -- Its place among the packs: lower first.
  sort       integer,
  rev        bigint NOT NULL DEFAULT nextval('emoji_rev'),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT emoji_packs_kind CHECK (
    CASE WHEN builtin THEN id ~ '^[a-z]{2,16}$' AND deleted_at IS NULL
      ELSE id ~ '^ep[0-9]{1,9}$' AND name IS NOT NULL AND price IS NOT NULL AND min_vip IS NOT NULL AND enabled IS NOT NULL AND sort IS NOT NULL
    END
  )
);
-- One name per pack on the shelves (an older app buys a pack by its name); emoji.mjs also keeps clear of the app's.
CREATE UNIQUE INDEX IF NOT EXISTS emoji_packs_name ON emoji_packs (lower(name)) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS emoji_stickers (
  id         text PRIMARY KEY,
  builtin    boolean NOT NULL DEFAULT false,
  -- Its pack: always for an admin's sticker; for one of the app's only when it was moved (NULL: its pack in the app).
  pack_id    text CHECK (char_length(pack_id) <= 16),
  name       text CHECK (char_length(name) BETWEEN 1 AND 24),
  -- The closest standard emoji: what a phone shows where it can't draw the picture (a text line, the web).
  emoji      text CHECK (char_length(emoji) BETWEEN 1 AND 16),
  enabled    boolean,
  sort       integer,
  -- Its picture, a stored file (media.mjs kind stickerart): a PNG or WebP ('image') or a Lottie animation ('lottie');
  -- on one of the app's, NULL is the app's own. art_link: the link it was fetched from (NULL: uploaded).
  art_url    text CHECK (char_length(art_url) <= 500),
  art_kind   text CHECK (art_kind IN ('image', 'lottie')),
  art_link   text CHECK (char_length(art_link) <= 2000),
  rev        bigint NOT NULL DEFAULT nextval('emoji_rev'),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK ((art_url IS NULL) = (art_kind IS NULL)),
  CONSTRAINT emoji_stickers_kind CHECK (
    CASE WHEN builtin THEN id ~ '^[a-z0-9]+(-[a-z0-9]+)+$' AND deleted_at IS NULL
      ELSE id ~ '^es[0-9]{1,9}$' AND pack_id IS NOT NULL AND name IS NOT NULL AND emoji IS NOT NULL AND enabled IS NOT NULL AND sort IS NOT NULL
        AND (art_url IS NOT NULL OR deleted_at IS NOT NULL)
    END
  )
);
CREATE INDEX IF NOT EXISTS emoji_stickers_pack ON emoji_stickers (pack_id) WHERE deleted_at IS NULL;
