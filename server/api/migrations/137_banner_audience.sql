-- Banner Yönetimi: who sees a banner (owners, 26 Nov 2026). all: everyone; no_agency: someone in no agency (not its
-- streamer, owner or team), as the agency application banner. The agency application banner itself becomes a managed
-- banner (its picture ships with the app, app/assets/banners/ajans-basvurusu.webp), first in the order; the owners turn
-- it off, move it or give it dates in the panel.
ALTER TABLE banners ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'all' CHECK (audience IN ('all', 'no_agency'));
INSERT INTO banners (title, subtitle, cta, link, art, show_text, accent, enabled, first_on_at, sort, audience)
SELECT 'Ajans Başvurusu', 'Kendi ajansını kur veya güçlü bir ekibe katıl', '', '/ajans', 'ajans-basvurusu', false, 'mor', true, now(), 0, 'no_agency'
 WHERE NOT EXISTS (SELECT 1 FROM banners WHERE art = 'ajans-basvurusu');
