-- Ses dalgası (catalog.mjs 'wave' rows): the ring around a speaker's seat, a shop item worn like a frame. One more
-- entitlement kind; the list is 052's with 'wave' added.
ALTER TABLE entitlements DROP CONSTRAINT IF EXISTS entitlements_kind_check;
ALTER TABLE entitlements ADD CONSTRAINT entitlements_kind_check
  CHECK (kind IN ('frame', 'entry', 'ride', 'bubble', 'specialId', 'sticker', 'micfx', 'noble', 'roombg', 'wave'));
