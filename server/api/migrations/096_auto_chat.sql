-- Otomatik mesajlaşma, 5 dakika kuralı ve SimilarClub Sistem (docs/OTOMATIK_MESAJ.md, 18 Nov 2026).

-- Where a message came from: typed by its writer, a streamer's automatic message (her templates, auto-chat.mjs),
-- a man's free conversation start sent by the system in his name (opener), or a streamer's quick reply.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual'
  CHECK (source IN ('manual', 'auto_streamer', 'auto_opener', 'quick_reply'));
-- The template (1-10) or pool line an automatic message or a quick reply used.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS template_no smallint;

-- A paid message to a streamer waits for her answer (message-holds.mjs): its coins leave the payer at once and
-- are held here with the lots they came from. A valid answer by the deadline (server time, plus a short grace)
-- turns them into her diamonds (paid_events, ledger `{ref}-in`); no answer gives them back to the payer
-- (`{ref}:iade`, the same lots). A store refund of the coins ends it as withdrawn. No key to messages: an account's
-- deletion removes its messages, the accounting row stays.
CREATE TABLE IF NOT EXISTS message_holds (
  message_id   bigint PRIMARY KEY,
  payer        uuid NOT NULL REFERENCES users(id),
  earner       uuid NOT NULL REFERENCES users(id),
  coins        int NOT NULL CHECK (coins > 0),
  held_lots    jsonb NOT NULL DEFAULT '[]',
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'won', 'expired', 'withdrawn')),
  delivered_at timestamptz NOT NULL,
  deadline_at  timestamptz NOT NULL,
  -- Her first answer after it arrived (in time or late), for the performance figures.
  reply_id     bigint,
  replied_at   timestamptz,
  reply_source text,
  -- Coins that went back to the payer (all of them when expired; what a store refund left when withdrawn).
  returned     int NOT NULL DEFAULT 0,
  settled_at   timestamptz,
  ref          text NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS message_holds_pending ON message_holds (deadline_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS message_holds_unanswered ON message_holds (earner, payer) WHERE replied_at IS NULL;
CREATE INDEX IF NOT EXISTS message_holds_earner ON message_holds (earner, delivered_at);
CREATE INDEX IF NOT EXISTS message_holds_payer ON message_holds (payer, delivered_at);

-- A streamer's own wording of her 10 automatic messages; a template without a row is the default one.
CREATE TABLE IF NOT EXISTS auto_templates (
  user_id    uuid NOT NULL REFERENCES users(id),
  no         smallint NOT NULL CHECK (no BETWEEN 1 AND 10),
  body       text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, no)
);

-- Daily rights, by Turkey's day (Europe/Istanbul, new at 00.00): a streamer's automatic messages ('auto') and quick
-- replies ('quick'), a man's free conversation starts ('opener'). Counted only when the message was stored.
CREATE TABLE IF NOT EXISTS auto_quota (
  user_id uuid NOT NULL REFERENCES users(id),
  day     date NOT NULL,
  kind    text NOT NULL CHECK (kind IN ('auto', 'quick', 'opener')),
  used    int NOT NULL DEFAULT 0 CHECK (used >= 0),
  PRIMARY KEY (user_id, day, kind)
);

-- Every automatic message the matching sent ('streamer': hers to a man, 'opener': a man's free start to a woman),
-- and when its recipient first answered: how often someone answers decides how many they get.
CREATE TABLE IF NOT EXISTS auto_sends (
  id          bigserial PRIMARY KEY,
  kind        text NOT NULL CHECK (kind IN ('streamer', 'opener')),
  sender      uuid NOT NULL REFERENCES users(id),
  recipient   uuid NOT NULL REFERENCES users(id),
  message_id  bigint NOT NULL,
  template_no smallint,
  created_at  timestamptz NOT NULL DEFAULT now(),
  replied_at  timestamptz
);
CREATE INDEX IF NOT EXISTS auto_sends_recipient ON auto_sends (recipient, created_at);
CREATE INDEX IF NOT EXISTS auto_sends_sender ON auto_sends (sender, created_at);
CREATE INDEX IF NOT EXISTS auto_sends_open ON auto_sends (sender, recipient) WHERE replied_at IS NULL;

-- The choices (privacy.mjs): automatic conversation starts reach me; the system may start conversations in my name
-- (men, on from the start, the owners' decision); my app has told me what that is (only then does one go out); my
-- automatic messages go out (streamers).
ALTER TABLE privacy_settings
  ADD COLUMN IF NOT EXISTS auto_receive boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_opener boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_opener_seen boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_send boolean NOT NULL DEFAULT true;

-- SimilarClub Sistem (system-notices.mjs) writes into Similar Ekibi's table: one person's notice, from the
-- server, with its category, the record it tells of (ref, once per person) and the figures (data).
ALTER TABLE team_notices
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS ref text CHECK (char_length(ref) <= 120),
  ADD COLUMN IF NOT EXISTS data jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS team_notices_ref ON team_notices (target, ref) WHERE ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS team_notices_category ON team_notices (category, created_at) WHERE category IS NOT NULL;
CREATE INDEX IF NOT EXISTS team_notices_target_category ON team_notices (target, category, created_at) WHERE category IS NOT NULL;

-- A system notice that could not be written: for the panel's "başarısız gönderimler". No key to users: a staff record.
CREATE TABLE IF NOT EXISTS system_notice_failures (
  id         bigserial PRIMARY KEY,
  category   text NOT NULL,
  target     uuid,
  ref        text,
  error      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- A call's notices went out (or it had nothing to tell). Calls that ended before this migration are told nothing.
ALTER TABLE calls ADD COLUMN IF NOT EXISTS notice_at timestamptz;
UPDATE calls SET notice_at = coalesce(ended_at, now()) WHERE status NOT IN ('ringing', 'live') AND notice_at IS NULL;
CREATE INDEX IF NOT EXISTS calls_notice ON calls (ended_at) WHERE notice_at IS NULL AND status = 'ended';
-- A call's paid minutes, summed for its notices.
CREATE INDEX IF NOT EXISTS paid_events_call ON paid_events (call_id) WHERE call_id IS NOT NULL;

-- An Oda içi PK's result notices went out (system-notices.mjs). PKs that ended before this migration are told nothing.
ALTER TABLE room_pks ADD COLUMN IF NOT EXISTS notice_at timestamptz;
UPDATE room_pks SET notice_at = now() WHERE notice_at IS NULL AND (status <> 'active' OR end_at <= now());
CREATE INDEX IF NOT EXISTS room_pks_notice ON room_pks (end_at) WHERE notice_at IS NULL;

-- Once-a-day work (the message summary, the late-answer warnings): the last Turkey day it ran for.
CREATE TABLE IF NOT EXISTS auto_chat_jobs (
  job      text PRIMARY KEY,
  last_day date NOT NULL,
  ran_at   timestamptz NOT NULL DEFAULT now()
);
