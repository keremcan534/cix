-- Ödeme kuru (owners, 24 Nov 2026: "ajanslara ve yayıncılara ödemeleri yaparken baz alacağımız kur", 1 USD = 49 TL,
-- set by hand in Canlı ayarlar › payout_usd_try). When staff mark a withdrawal or an agency payout paid, the rate in
-- effect and the TL it made are written on it, so a later rate never changes what was paid.
ALTER TABLE withdrawals ADD COLUMN pay_usd_try numeric(8, 2) CHECK (pay_usd_try IS NULL OR pay_usd_try > 0);
ALTER TABLE withdrawals ADD COLUMN pay_tl numeric(14, 2) CHECK (pay_tl IS NULL OR pay_tl >= 0);
ALTER TABLE agency_payouts ADD COLUMN pay_usd_try numeric(8, 2) CHECK (pay_usd_try IS NULL OR pay_usd_try > 0);
ALTER TABLE agency_payouts ADD COLUMN pay_tl numeric(14, 2) CHECK (pay_tl IS NULL OR pay_tl >= 0);
