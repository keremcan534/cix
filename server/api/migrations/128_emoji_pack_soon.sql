-- Çarşı › Çıkartma paketleri "Yakında" (emoji.mjs, owners 25 Nov 2026): a pack on the shelf with the tag, not sold or
-- opened. NULL: as the default (an app's pack sold or opened by VIP: yes; any other: no). Yönetim › Emojiler turns it
-- on or off.
ALTER TABLE emoji_packs ADD COLUMN soon boolean;
