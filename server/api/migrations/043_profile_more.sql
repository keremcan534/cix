-- The rest of a profile (profiles.mjs): the personal extras a person fills in, the album, and whether their gender
-- is shown to others. All optional and typed by the person; a cleared field is gone (no history). Deleted with the
-- account (social.mjs eraseAccount; the album's files with media.mjs removeUserFiles).

CREATE TABLE IF NOT EXISTS profile_extras (
  user_id      uuid PRIMARY KEY REFERENCES users(id),
  height_cm    smallint CHECK (height_cm BETWEEN 120 AND 230),
  weight_kg    smallint CHECK (weight_kg BETWEEN 30 AND 250),
  job          text CHECK (char_length(job) <= 30),
  languages    text[] NOT NULL DEFAULT '{}' CHECK (cardinality(languages) <= 5),
  zodiac       text CHECK (char_length(zodiac) <= 20),
  -- Kişilik Etiketleri, by label (profile-rules.mjs TAGS).
  tags         text[] NOT NULL DEFAULT '{}' CHECK (cardinality(tags) <= 5),
  relationship text CHECK (char_length(relationship) <= 20),
  education    text CHECK (char_length(education) <= 20),
  slogan       text CHECK (char_length(slogan) <= 80),
  country      text CHECK (country ~ '^[A-Z]{2}$'),
  -- "Seviyeyi Gizle" (a VIP right): others don't get that level while the person has VIP.
  hide_wealth  boolean NOT NULL DEFAULT false,
  hide_charm   boolean NOT NULL DEFAULT false,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Albüm: at most 6 photos each (profiles.mjs ALBUM_MAX), files under album/<user>/ in the storage.
CREATE TABLE IF NOT EXISTS profile_photos (
  id         bigserial PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id),
  url        text NOT NULL CHECK (char_length(url) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, url)
);

-- "Gizli" gender: kept for Keşfet's rule, 1v1 matching and the agency rule, never sent to other people.
ALTER TABLE users ADD COLUMN IF NOT EXISTS gender_hidden boolean NOT NULL DEFAULT false;
