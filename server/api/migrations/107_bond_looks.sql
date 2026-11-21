-- Bağ işaretleri (docs/BAGLAR.md "Panelden bağ işaretleri", bond-looks.mjs): the mark drawn between two bonded people
-- (on the mics, on the profile's Bağlar row) as staff design it, level by level, for each bond kind. A row is one kind's
-- one level: its still picture (a transparent PNG or WebP, media.mjs shopframe, made at most 512 px for phones) and/or
-- its moving one (an animated WebP; an SVGA is turned into both first), and how big it is drawn next to the app's own
-- mark (`size`, 1–3 times). A level without a row takes the nearest lower level's design; below the first design (or
-- with none at all) the app draws its own mark (the kind's picture in the tier's ring).
--
-- A row is never deleted: taking a level's design off empties it (both pictures NULL), and every change takes the next
-- bond_look_rev, so the catalog's `v` (which adds the largest) only grows and phones read the catalog again. Only
-- additions: an older server ignores all of it.
CREATE SEQUENCE IF NOT EXISTS bond_look_rev;
CREATE TABLE IF NOT EXISTS bond_looks (
  kind         text NOT NULL CHECK (kind IN ('cift', 'kardes', 'baci', 'agabey', 'abla', 'yenge', 'enishte', 'kanka')),
  level        integer NOT NULL CHECK (level BETWEEN 1 AND 20),
  art_url      text CHECK (char_length(art_url) <= 500),
  art_v        text CHECK (art_v ~ '^[0-9a-f]{12}$'),
  art_px       integer CHECK (art_px BETWEEN 64 AND 1024),
  motion_url   text CHECK (char_length(motion_url) <= 500),
  motion_v     text CHECK (motion_v ~ '^[0-9a-f]{12}$'),
  motion_px    integer CHECK (motion_px BETWEEN 64 AND 512),
  motion_bytes integer CHECK (motion_bytes > 0),
  size         real NOT NULL DEFAULT 1 CHECK (size >= 1 AND size <= 3),
  rev          bigint NOT NULL DEFAULT nextval('bond_look_rev'),
  updated_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, level),
  CHECK ((art_url IS NULL) = (art_v IS NULL)),
  CHECK ((motion_url IS NULL) = (motion_v IS NULL))
);
