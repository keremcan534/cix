-- A photo in a chat (messages.mjs): its address in the storage (media.mjs dm/<sender>/...), null for text only.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS image_url text CHECK (image_url IS NULL OR char_length(image_url) <= 500);
