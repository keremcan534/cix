-- Yönetim › Hediyeler for the app's own gifts too (custom-gifts.mjs, docs/HEDIYE_YONETIMI.md): a row whose id is a
-- compiled gift's (catalog.mjs GIFT_ROWS: g1, h15, c13, v12, …) holds what the admins changed about that gift, each
-- NULL column "as in the app": name, emoji, price, shelf, VIP level, place on the shelf, on the shelves or not, icon,
-- video. Such a row is never deleted, so its rev stays (the phones' catalog version only grows): going back to the
-- app's values sets its columns to NULL again. video_off: the gift's own clip (fx.mjs) is not played; video_url is
-- one the admins gave it instead. The admins' own gifts ('a' and a number) keep every column filled, as before.
ALTER TABLE custom_gifts ADD COLUMN builtin boolean NOT NULL DEFAULT false;
ALTER TABLE custom_gifts ADD COLUMN video_off boolean NOT NULL DEFAULT false;
ALTER TABLE custom_gifts DROP CONSTRAINT custom_gifts_id_check;
ALTER TABLE custom_gifts
  ALTER COLUMN name DROP NOT NULL,
  ALTER COLUMN emoji DROP NOT NULL,
  ALTER COLUMN price DROP NOT NULL,
  ALTER COLUMN cat DROP NOT NULL,
  ALTER COLUMN min_svip DROP NOT NULL,
  ALTER COLUMN sort DROP NOT NULL,
  ALTER COLUMN enabled DROP NOT NULL,
  ALTER COLUMN icon_url DROP NOT NULL;
ALTER TABLE custom_gifts ADD CONSTRAINT custom_gifts_kind CHECK (
  CASE WHEN builtin
    THEN id ~ '^[b-z][0-9]{1,3}$' AND deleted_at IS NULL AND NOT (video_off AND (video_url IS NOT NULL OR job_status IS NOT NULL))
    ELSE id ~ '^a[0-9]{1,9}$' AND name IS NOT NULL AND emoji IS NOT NULL AND price IS NOT NULL AND cat IS NOT NULL
      AND min_svip IS NOT NULL AND sort IS NOT NULL AND enabled IS NOT NULL AND icon_url IS NOT NULL AND NOT video_off
  END
);
