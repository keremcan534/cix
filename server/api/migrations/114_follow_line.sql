-- Takip satırı (owners, 22 Nov 2026): a new follow writes "Seni takip etti" into the private chat of the two, from the
-- follower to the person followed (social.mjs followLine). Its own source, so nothing that reads people's messages
-- (automatic messages, quick replies, who may write to whom) takes it for a message someone wrote.
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_source_check;
ALTER TABLE messages ADD CONSTRAINT messages_source_check CHECK (source IN ('manual', 'auto_streamer', 'auto_opener', 'quick_reply', 'follow'));
