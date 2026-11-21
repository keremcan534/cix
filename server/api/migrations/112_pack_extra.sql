-- Jeton paketleri (Canlı ayarlar › pack_setup, owners, 22 Nov 2026): a purchase's extra coins as the panel set them for
-- its pack when it was verified, apart from the first-purchase gift (bonus) and the campaign's (campaign_bonus). Its
-- coins are a 'bonus' lot of the purchase, so a refund takes them back with the rest.
ALTER TABLE purchases ADD COLUMN extra bigint NOT NULL DEFAULT 0 CHECK (extra >= 0);
