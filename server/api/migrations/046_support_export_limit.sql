-- Destek talepleri (support.mjs): a person's ticket to the support team, with up to 3 evidence photos (media.mjs
-- ticket/<their id>/…) and a thread of replies between them and staff. A closed ticket and its photos are deleted
-- a year after it was closed; all of a person's tickets go with their account (eraseAccount).
CREATE TABLE IF NOT EXISTS support_tickets (
  id         bigserial PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id),
  category   text NOT NULL CHECK (char_length(category) BETWEEN 2 AND 40),
  -- Ayarlar › Destek › Geri bildirim: a suggestion rather than a problem.
  feedback   boolean NOT NULL DEFAULT false,
  body       text NOT NULL CHECK (char_length(body) BETWEEN 10 AND 2000),
  photos     text[] NOT NULL DEFAULT '{}' CHECK (cardinality(photos) <= 3),
  -- open: waiting for staff; answered: staff replied, waiting for the person; reopened: the person wrote again
  -- after an answer or a close; closed: solved (by either side).
  status     text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'answered', 'reopened', 'closed')),
  ref        text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at  timestamptz,
  closed_by  uuid REFERENCES users(id),
  UNIQUE (user_id, ref)
);
CREATE INDEX IF NOT EXISTS support_tickets_user ON support_tickets (user_id, id DESC);
CREATE INDEX IF NOT EXISTS support_tickets_queue ON support_tickets (status, updated_at);
CREATE INDEX IF NOT EXISTS support_tickets_closed ON support_tickets (closed_at) WHERE status = 'closed';

CREATE TABLE IF NOT EXISTS support_messages (
  id         bigserial PRIMARY KEY,
  ticket_id  bigint NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author     uuid NOT NULL REFERENCES users(id),
  -- Written by staff (shown to the person as "Destek", never by name).
  staff      boolean NOT NULL,
  body       text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_messages_ticket ON support_messages (ticket_id, id);

-- Verilerimin kopyası (my-data.mjs, UK GDPR right of access): when this person last downloaded their data, for the
-- once-a-day limit. One row per person, nothing else; it goes with the account.
CREATE TABLE IF NOT EXISTS data_exports (
  user_id uuid PRIMARY KEY REFERENCES users(id),
  last_at timestamptz NOT NULL DEFAULT now()
);

-- Günlük harcama limiti (spend-limit.mjs): the person's daily coin limit (null: none), a raise or a lift waiting
-- its 24 hours (next_limit 0: no limit), and the coins spent on spent_day (Turkey's date). Only the last spending
-- day is kept; the row goes with the account.
CREATE TABLE IF NOT EXISTS spend_limits (
  user_id     uuid PRIMARY KEY REFERENCES users(id),
  daily_limit bigint CHECK (daily_limit > 0),
  next_limit  bigint CHECK (next_limit >= 0),
  next_at     timestamptz,
  spent_day   date,
  spent       bigint NOT NULL DEFAULT 0 CHECK (spent >= 0),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK ((next_limit IS NULL) = (next_at IS NULL))
);
