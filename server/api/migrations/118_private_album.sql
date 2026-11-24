-- Özel albüm (owners, 24 Nov 2026): an approved agency streamer's photos that others open with coins
-- (private-album.mjs). The price is Canlı ayarlar's (live_settings private_album_price); the coins become the
-- streamer's diamonds as a gift's do, and the agency's commission runs as for a gift.
--
-- private_album_photos: the streamer's own (removed_at: taken down by staff, kept as the record of what was shown;
-- a photo its owner takes out is deleted with its file). private_album_unlocks: who opened whose album, for what,
-- with the request's ref (the ledger's coin row is `ref`, the streamer's diamond row `ref-in`); one per pair, for
-- good: whoever opened it sees the album as it grows. Money records: kept when either account is deleted.
CREATE TABLE IF NOT EXISTS private_album_photos (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  removed_by uuid REFERENCES users(id),
  removed_reason text,
  UNIQUE (user_id, url)
);
CREATE INDEX IF NOT EXISTS private_album_photos_shown ON private_album_photos (user_id, id) WHERE removed_at IS NULL;

CREATE TABLE IF NOT EXISTS private_album_unlocks (
  id bigserial PRIMARY KEY,
  viewer uuid NOT NULL REFERENCES users(id),
  owner uuid NOT NULL REFERENCES users(id),
  coins bigint NOT NULL CHECK (coins > 0),
  ref text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (viewer, owner),
  UNIQUE (viewer, ref)
);
CREATE INDEX IF NOT EXISTS private_album_unlocks_owner ON private_album_unlocks (owner, created_at);

-- The agency income of an unlock goes in as a gift's ('gift'): the owners' rule, "hediye gibi yayıncıya".
