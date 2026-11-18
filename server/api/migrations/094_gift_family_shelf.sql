-- The Aile ve Dost shelf (catalog.mjs): Koruma Kartı and the bond gifts can be changed in Hediyeler like the app's other
-- gifts. Their ids are words (koruma, bag-kardes), which the app's own gifts' rule did not allow.
ALTER TABLE custom_gifts DROP CONSTRAINT custom_gifts_cat_check;
ALTER TABLE custom_gifts ADD CONSTRAINT custom_gifts_cat_check CHECK (cat IN ('hot', 'couple', 'family', 'gameplay', 'privilege'));
ALTER TABLE custom_gifts DROP CONSTRAINT custom_gifts_kind;
ALTER TABLE custom_gifts ADD CONSTRAINT custom_gifts_kind CHECK (
  CASE WHEN builtin
    THEN (id ~ '^[b-z][0-9]{1,3}$' OR id = 'koruma' OR id ~ '^bag-[a-z]{2,12}$') AND deleted_at IS NULL AND NOT (video_off AND (video_url IS NOT NULL OR job_status IS NOT NULL))
    ELSE id ~ '^a[0-9]{1,9}$' AND name IS NOT NULL AND emoji IS NOT NULL AND price IS NOT NULL AND cat IS NOT NULL
      AND min_svip IS NOT NULL AND sort IS NOT NULL AND enabled IS NOT NULL AND icon_url IS NOT NULL AND NOT video_off
  END
);
