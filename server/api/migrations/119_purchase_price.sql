-- The price of each coin purchase, written on it when it is credited (owners, 24 Nov 2026: 1.000 jeton = 220 TL).
-- Bookings (finance-sync.mjs) and refunds (refunds.mjs) read it, so a purchase keeps the price it had when the pack
-- prices change. Purchases from before this column carry the price their pack had until then.
ALTER TABLE purchases ADD COLUMN price_tl numeric(12, 2) CHECK (price_tl IS NULL OR price_tl >= 0);

UPDATE purchases SET price_tl = CASE product_id
    WHEN 'coins_1000' THEN 29.99
    WHEN 'coins_5000' THEN 139.99
    WHEN 'coins_10000' THEN 269.99
    WHEN 'coins_20000' THEN 519.99
    WHEN 'coins_50000' THEN 1279.99
    WHEN 'coins_100000' THEN 2499.99
    WHEN 'coins_200000' THEN 4899.99
    WHEN 'coins_500000' THEN 11999.99
    WHEN 'coins_1000000' THEN 23599.99
  END
  WHERE price_tl IS NULL;
