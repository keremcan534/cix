-- Yakında (owners, 22 Nov 2026): one of the app's own gifts can show on its shelf, greyed with "Yakında", and not be
-- sent (custom-gifts.mjs GIFTS_SOON, giftSoon). NULL is the app's own value: the Aile ve Dost bond gifts but Çift start
-- as "Yakında" (catalog.mjs GIFTS_SOON); the panel turns each on or off.
ALTER TABLE custom_gifts ADD COLUMN IF NOT EXISTS soon boolean;
