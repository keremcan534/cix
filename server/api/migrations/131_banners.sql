-- Banner Yönetimi (owners, 25 Nov 2026; banners.mjs, docs/BANNER_YONETIMI.md): the management's banners at the top
-- of Odalar. A picture is an upload (media kind notice) or one of the app's own (`art`, app/assets/banners/ornek-*).
-- Rows are never deleted: a removed banner keeps its row (removed_at) for the record and its numbers.
CREATE TABLE banners (
  id          bigserial PRIMARY KEY,
  title       text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 60),
  subtitle    text NOT NULL DEFAULT '' CHECK (char_length(subtitle) <= 120),
  cta         text NOT NULL DEFAULT '' CHECK (char_length(cta) <= 24),
  link        text CHECK (link IS NULL OR char_length(link) <= 120),
  image_url   text CHECK (image_url IS NULL OR char_length(image_url) <= 500),
  art         text CHECK (art IS NULL OR art ~ '^[a-z0-9-]{1,40}$'),
  show_text   boolean NOT NULL DEFAULT true,
  accent      text NOT NULL DEFAULT 'mor' CHECK (accent IN ('mor', 'pembe', 'altin', 'turkuaz')),
  starts_at   timestamptz,
  ends_at     timestamptz,
  enabled     boolean NOT NULL DEFAULT false,
  first_on_at timestamptz,
  sort        int NOT NULL DEFAULT 0,
  created_by  uuid REFERENCES users(id),
  updated_by  uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  removed_at  timestamptz,
  removed_by  uuid REFERENCES users(id),
  CHECK (image_url IS NOT NULL OR art IS NOT NULL),
  CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at)
);
CREATE INDEX banners_live ON banners (sort, id) WHERE removed_at IS NULL;

-- How many people saw and tapped each banner a day (Türkiye's day); each person once a day per banner.
CREATE TABLE banner_stats (
  banner_id bigint NOT NULL REFERENCES banners(id),
  day       date NOT NULL,
  views     int NOT NULL DEFAULT 0 CHECK (views >= 0),
  clicks    int NOT NULL DEFAULT 0 CHECK (clicks >= 0),
  PRIMARY KEY (banner_id, day)
);

-- The owners' three example banners (their pictures ship with the app), on at once; they change or remove them in
-- the panel.
INSERT INTO banners (title, subtitle, cta, link, art, show_text, accent, enabled, first_on_at, sort) VALUES
  ('En Çok Hediye Alanlar', 'Haftanın en çok desteklenen yayıncıları', 'Sıralamayı Gör', '/siralama?board=yayinci&period=weekly', 'ornek-hediye-alanlar', false, 'turkuaz', true, now(), 1),
  ('En Çok Hediye Gönderenler', 'Cömertliğin zirvesindekiler', 'Sıralamayı Gör', '/siralama?board=zengin&period=weekly', 'ornek-hediye-gonderenler', false, 'altin', true, now(), 2),
  ('Zirvedeki Ajanslar', 'Yayıncılarının kazandığı elmasla', 'Sıralamayı Gör', '/siralama?board=ajans&period=weekly', 'ornek-zirvedeki-ajanslar', false, 'mor', true, now(), 3);
