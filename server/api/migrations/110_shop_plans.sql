-- Güncelleme 8, madde 6: Çarşı'da bir ürünün ana süresinin yanında başka süre paketleri (7, 15, 30 gün …), her biri
-- kendi fiyatıyla (shop-items.mjs plansOf). NULL: yalnız ana süre. The app's own items keep theirs in their row too.
ALTER TABLE shop_items ADD COLUMN IF NOT EXISTS plans jsonb;
