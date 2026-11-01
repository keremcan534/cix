-- Launch: phone sign-in, sessions you can see and end, push tokens, gifts priced by the server, store
-- purchases, SVIP experience and who is in which voice room.

ALTER TABLE users
  -- E.164 (+905xxxxxxxxx). Cleared when the account is deleted, so the number can open a new account.
  ADD COLUMN phone   text UNIQUE CHECK (phone ~ '^\+[1-9][0-9]{7,14}$'),
  -- SVIP: 1 purchased coin = 1 point, never expires (app/src/data/status.ts).
  ADD COLUMN svip_xp bigint NOT NULL DEFAULT 0 CHECK (svip_xp >= 0);

-- Sessions: a label for the device list in Settings and when each was last used.
ALTER TABLE sessions
  ADD COLUMN device       text NOT NULL DEFAULT '' CHECK (char_length(device) <= 60),
  ADD COLUMN last_seen_at timestamptz NOT NULL DEFAULT now();

-- One-time sign-in codes. Only a hash of the code is kept; a code works once, for a few minutes, with a
-- few tries. sent_count / window_start limit how many codes one number can get per hour.
CREATE TABLE otp_codes (
  phone        text PRIMARY KEY,
  code_hash    text NOT NULL,
  expires_at   timestamptz NOT NULL,
  attempts     int NOT NULL DEFAULT 0,
  sent_at      timestamptz NOT NULL DEFAULT now(),
  sent_count   int NOT NULL DEFAULT 1,
  window_start timestamptz NOT NULL DEFAULT now()
);

-- Expo push tokens. A token belongs to the account last signed in on that phone.
CREATE TABLE push_tokens (
  token      text PRIMARY KEY CHECK (char_length(token) <= 200),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform   text NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX push_tokens_user ON push_tokens(user_id);

-- Every gift sent, at the server's price. Rankings (wealth = sent, charm = received) are read from here.
CREATE TABLE gift_events (
  id         bigserial PRIMARY KEY,
  sender     uuid NOT NULL REFERENCES users(id),
  recipient  uuid NOT NULL REFERENCES users(id),
  gift_id    text NOT NULL,
  count      int NOT NULL CHECK (count > 0),
  unit_price bigint NOT NULL CHECK (unit_price > 0),
  total      bigint NOT NULL CHECK (total > 0),
  room       text CHECK (char_length(room) <= 64),
  ref        text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sender, ref)
);
CREATE INDEX gift_events_time ON gift_events(created_at);
CREATE INDEX gift_events_recipient ON gift_events(recipient, created_at);

-- Store purchases: one row per store transaction, so a receipt credits coins exactly once.
CREATE TABLE purchases (
  id             bigserial PRIMARY KEY,
  user_id        uuid NOT NULL REFERENCES users(id),
  platform       text NOT NULL CHECK (platform IN ('ios', 'android', 'test')),
  product_id     text NOT NULL,
  transaction_id text NOT NULL CHECK (char_length(transaction_id) <= 200),
  coins          bigint NOT NULL CHECK (coins > 0),
  bonus          bigint NOT NULL DEFAULT 0 CHECK (bonus >= 0),
  status         text NOT NULL DEFAULT 'credited' CHECK (status IN ('credited', 'refunded')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, transaction_id)
);
CREATE INDEX purchases_user ON purchases(user_id, created_at DESC);

-- Who is in which LiveKit room right now, from LiveKit's webhooks (participant joined / left). `sid` is the
-- connection: when someone reconnects, the old connection's "left" must not remove the new one.
CREATE TABLE room_presence (
  room      text NOT NULL CHECK (char_length(room) <= 64),
  identity  text NOT NULL CHECK (char_length(identity) <= 64),
  sid       text NOT NULL DEFAULT '' CHECK (char_length(sid) <= 64),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (room, identity)
);
