-- Takip satırı (owners, 22 Nov 2026): a new follow writes "Seni takip etti" into the private chat of the two, from the
-- follower to the person followed (social.mjs followLine). Its own source, so nothing that reads people's messages
-- (automatic messages, quick replies, who may write to whom) takes it for a message someone wrote.
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_source_check;
ALTER TABLE messages ADD CONSTRAINT messages_source_check CHECK (source IN ('manual', 'auto_streamer', 'auto_opener', 'quick_reply', 'follow'));

-- The heart (chat_days, 081) counts messages people wrote: not a follow's line, which would let following and
-- unfollowing raise a heart that opens paid calls.
CREATE OR REPLACE FUNCTION chat_days_count() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.source = 'follow' THEN
    RETURN NULL;
  END IF;
  INSERT INTO chat_days (lo, hi, day, n)
  VALUES (LEAST(NEW.sender, NEW.recipient), GREATEST(NEW.sender, NEW.recipient), (NEW.created_at AT TIME ZONE 'Europe/Istanbul')::date, 1)
  ON CONFLICT (lo, hi, day) DO UPDATE SET n = chat_days.n + 1;
  RETURN NULL;
END $$;
