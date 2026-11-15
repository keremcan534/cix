-- Yönetim › Hediyeler: the link a gift's icon or video was fetched from ("ya da bağlantı yapıştır",
-- custom-gifts.mjs POST /api/admin/gifts/fetch), kept so the panel can fetch the same link again. NULL: uploaded.
ALTER TABLE custom_gifts ADD COLUMN icon_link text, ADD COLUMN video_link text;
