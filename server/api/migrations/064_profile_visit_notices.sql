-- Profil ziyaretçileri, Güncelleme 5: the profile's owner is told of a visit (social.mjs recordVisit), at most once a
-- day for each visitor: when the last notice for this pair went. Null until the first one (and for the rows of
-- before); it goes with the row (pruned after 8 days without a visit, or with an erased account).
ALTER TABLE profile_visits ADD COLUMN IF NOT EXISTS notified_at timestamptz;
