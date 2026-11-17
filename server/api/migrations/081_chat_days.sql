-- The heart (one-on-one.mjs heartPoints) counts how much two people chat: their messages a day (Turkey's day), kept
-- by a trigger as messages are written, so the heart reads a few rows instead of the whole chat (pairOf runs on every
-- message sent). A deleted account's days go with its messages (social.mjs).
CREATE TABLE IF NOT EXISTS chat_days (
  lo  uuid NOT NULL REFERENCES users(id),
  hi  uuid NOT NULL REFERENCES users(id),
  day date NOT NULL,
  n   integer NOT NULL CHECK (n > 0),
  PRIMARY KEY (lo, hi, day),
  CHECK (lo < hi)
);
CREATE INDEX IF NOT EXISTS chat_days_hi ON chat_days (hi, day);

CREATE OR REPLACE FUNCTION chat_days_count() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO chat_days (lo, hi, day, n)
  VALUES (LEAST(NEW.sender, NEW.recipient), GREATEST(NEW.sender, NEW.recipient), (NEW.created_at AT TIME ZONE 'Europe/Istanbul')::date, 1)
  ON CONFLICT (lo, hi, day) DO UPDATE SET n = chat_days.n + 1;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS messages_chat_days ON messages;
CREATE TRIGGER messages_chat_days AFTER INSERT ON messages FOR EACH ROW EXECUTE FUNCTION chat_days_count();

-- The last year of chat so far.
INSERT INTO chat_days (lo, hi, day, n)
SELECT LEAST(sender, recipient), GREATEST(sender, recipient), (created_at AT TIME ZONE 'Europe/Istanbul')::date, count(*)
  FROM messages
 WHERE created_at > now() - interval '365 days'
 GROUP BY 1, 2, 3
ON CONFLICT (lo, hi, day) DO UPDATE SET n = EXCLUDED.n;
