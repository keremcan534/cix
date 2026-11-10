-- Oda Süslemesi (the picture behind a room's stage) and Oda Kapağı (the picture on the room's card), room-decor.mjs.
--
-- rooms.bg_id: the free background the owner or a Süper Yönetici chose (catalog.mjs ROOM_COVERS, opened by the room's
-- level); NULL is the theme's own stage, as every room looked before. rooms.cover_id (034) is not the background:
-- it stays the picture older apps picked for the room's card, and the lists fall back to it while no cover is
-- uploaded, so a room that existed before this looks the same until its owner picks something.
-- rooms.cover_url: the card picture the owner or a Süper Yönetici uploaded (media.mjs kind 'roomcover'). Kept until
-- it is replaced or removed, the room closes or its uploader's account is deleted; the file goes with it.
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS bg_id text CHECK (bg_id ~ '^[a-z0-9-]{1,20}$');
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS cover_url text CHECK (char_length(cover_url) <= 500);
CREATE INDEX IF NOT EXISTS rooms_closed_cover ON rooms (id) WHERE cover_url IS NOT NULL AND closed_at IS NOT NULL;

-- What an owner has for their room beyond the free backgrounds. One row per owner, not per room: what was paid for
-- follows the owner into a room they open again.
--   pick           what the room shows now: 'custom', a paid background's sku, or NULL for the free one (rooms.bg_id).
--                  A pick whose term ended is simply not shown (worked out on every read), so the room is back on
--                  its last free background without anything being written.
--   custom_*       Özel süsleme: the owner's own picture (media.mjs kind 'roombg') and the end of the term they paid
--                  for; price and ref are the charge's (the ledger keeps the money trail). The picture is deleted
--                  when it is replaced or removed, when the term ends (the sweep, within minutes), when staff take
--                  it down (custom_removed_at; the term ends with it, no refund) and with the account.
--   changes_*      how many times the picture was replaced today (a daily cap on top of the per-minute one).
-- Deleted with the account (social.mjs eraseAccount).
CREATE TABLE IF NOT EXISTS room_decor (
  owner             uuid PRIMARY KEY REFERENCES users(id),
  pick              text CHECK (pick ~ '^[a-z0-9-]{2,40}$'),
  custom_url        text CHECK (char_length(custom_url) <= 500),
  custom_until      timestamptz,
  custom_paid_at    timestamptz,
  custom_price      bigint CHECK (custom_price >= 0),
  custom_ref        text CHECK (char_length(custom_ref) <= 64),
  custom_removed_at timestamptz,
  changes_day       date,
  changes           integer NOT NULL DEFAULT 0 CHECK (changes >= 0),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS room_decor_custom_due ON room_decor (custom_until) WHERE custom_url IS NOT NULL;

-- A paid room background is owned like a shop item (economy.mjs entitlements): one more kind. The list is 020's
-- with 'roombg' added.
ALTER TABLE entitlements DROP CONSTRAINT IF EXISTS entitlements_kind_check;
ALTER TABLE entitlements ADD CONSTRAINT entitlements_kind_check
  CHECK (kind IN ('frame', 'entry', 'ride', 'bubble', 'specialId', 'sticker', 'micfx', 'noble', 'roombg'));
