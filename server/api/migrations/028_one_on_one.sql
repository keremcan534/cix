-- 1v1 (one-on-one.mjs): paid messages, voice and video calls, and Eşleşme (random voice or video matches).
-- The prices are live settings (live-registry.mjs, group "Birebir"); each call keeps the price it started with.

-- Message fees and call minutes are streamer income too: the agency commission may count them (income_types).
ALTER TABLE income_events DROP CONSTRAINT IF EXISTS income_events_source_type_check;
ALTER TABLE income_events ADD CONSTRAINT income_events_source_type_check
  CHECK (source_type IN ('gift', 'lucky_gift', 'campaign', 'bonus', 'task_reward', 'refund', 'other', 'message', 'call'));

-- A call (kind 'call', from a chat) or a match (kind 'match', from the queue). payer: who pays each minute (null:
-- free); earner: who gets the diamonds (null: nobody, the coins are the platform's). A free match ends after
-- max_seconds. minutes: how many minutes were charged so far (the first when it goes live, then one at the start
-- of each new minute).
CREATE TABLE IF NOT EXISTS calls (
  id bigserial PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('call', 'match')),
  mode text NOT NULL CHECK (mode IN ('voice', 'video')),
  caller uuid NOT NULL REFERENCES users(id),
  callee uuid NOT NULL REFERENCES users(id),
  payer uuid REFERENCES users(id),
  earner uuid REFERENCES users(id),
  price int NOT NULL DEFAULT 0 CHECK (price >= 0),
  free boolean NOT NULL DEFAULT false,
  max_seconds int,
  status text NOT NULL DEFAULT 'ringing' CHECK (status IN ('ringing', 'live', 'ended', 'missed', 'declined', 'cancelled')),
  end_reason text,
  ended_by uuid REFERENCES users(id),
  ref text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  ended_at timestamptz,
  minutes int NOT NULL DEFAULT 0,
  coins bigint NOT NULL DEFAULT 0,
  caller_seen timestamptz NOT NULL DEFAULT now(),
  callee_seen timestamptz NOT NULL DEFAULT now(),
  UNIQUE (caller, ref)
);
CREATE INDEX IF NOT EXISTS calls_open ON calls (status) WHERE status IN ('ringing', 'live');
CREATE INDEX IF NOT EXISTS calls_caller ON calls (caller, created_at);
CREATE INDEX IF NOT EXISTS calls_callee ON calls (callee, created_at);
-- The free matches of the last 24 hours.
CREATE INDEX IF NOT EXISTS calls_free_matches ON calls (payer, created_at) WHERE kind = 'match' AND free;

-- Every coin paid for 1v1: one row per paid message and per charged minute. The heart level and Gelir read it.
CREATE TABLE IF NOT EXISTS paid_events (
  id bigserial PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('message', 'voice_call', 'video_call', 'match_voice', 'match_video')),
  payer uuid NOT NULL REFERENCES users(id),
  earner uuid REFERENCES users(id),
  coins int NOT NULL CHECK (coins > 0),
  message_id bigint,
  call_id bigint REFERENCES calls(id),
  ref text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS paid_events_earner ON paid_events (earner, created_at);
CREATE INDEX IF NOT EXISTS paid_events_payer ON paid_events (payer, earner);

-- Who waits for a match now. A phone that stops asking (seen_at) is left out after a few seconds.
CREATE TABLE IF NOT EXISTS match_queue (
  user_id uuid PRIMARY KEY REFERENCES users(id),
  mode text NOT NULL CHECK (mode IN ('voice', 'video')),
  gender text,
  joined_at timestamptz NOT NULL DEFAULT now(),
  seen_at timestamptz NOT NULL DEFAULT now()
);
