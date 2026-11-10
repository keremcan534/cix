-- Çantam (backpack.mjs): catalog gifts a person got free from a reward the server decided, sent later from the gift
-- panel without coins. backpack_items is what is in it now; backpack_moves is each change: a grant (its reward's
-- ref, e.g. the call task's day) or a send (the gift event it became). A reward's ref is taken once, so a repeated
-- claim never adds twice. Both are kept while the account exists and deleted with it (social.mjs eraseAccount);
-- the gift events stay as accounting records like any gift.
CREATE TABLE IF NOT EXISTS backpack_items (
  user_id    uuid NOT NULL REFERENCES users(id),
  gift_id    text NOT NULL CHECK (char_length(gift_id) <= 20),
  count      integer NOT NULL CHECK (count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, gift_id)
);

CREATE TABLE IF NOT EXISTS backpack_moves (
  id         bigserial PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id),
  gift_id    text NOT NULL CHECK (char_length(gift_id) <= 20),
  delta      integer NOT NULL CHECK (delta <> 0),
  source     text NOT NULL CHECK (source IN ('call_task', 'send')),
  ref        text NOT NULL CHECK (char_length(ref) <= 64),
  gift_event bigint REFERENCES gift_events(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, source, ref),
  CHECK ((source = 'send') = (delta < 0)),
  CHECK ((source = 'send') = (gift_event IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS backpack_moves_user ON backpack_moves (user_id, id DESC);
