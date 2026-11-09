-- Aile on the server (families.mjs): families, their members (one family per person), join requests and the
-- family chat. A family's power is not stored: it is the gifts its members sent since they joined (gift_events).
CREATE TABLE IF NOT EXISTS families (
  id bigserial PRIMARY KEY,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 24),
  announcement text NOT NULL DEFAULT '' CHECK (char_length(announcement) <= 200),
  -- open: anyone joins at once; approve: the leader or a helper accepts each request.
  join_mode text NOT NULL DEFAULT 'approve' CHECK (join_mode IN ('open', 'approve')),
  leader uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Closed when its last member leaves; the row stays for the founding fee's ledger record.
  closed_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS families_name ON families (lower(name)) WHERE closed_at IS NULL;

CREATE TABLE IF NOT EXISTS family_members (
  -- The primary key is the one-family rule.
  user_id uuid PRIMARY KEY REFERENCES users(id),
  family_id bigint NOT NULL REFERENCES families(id),
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'helper', 'member')),
  joined_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS family_members_of ON family_members (family_id);

CREATE TABLE IF NOT EXISTS family_requests (
  family_id bigint NOT NULL REFERENCES families(id),
  user_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (family_id, user_id)
);
CREATE INDEX IF NOT EXISTS family_requests_by_user ON family_requests (user_id);

CREATE TABLE IF NOT EXISTS family_messages (
  id bigserial PRIMARY KEY,
  family_id bigint NOT NULL REFERENCES families(id),
  author uuid NOT NULL REFERENCES users(id),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS family_messages_of ON family_messages (family_id, id DESC);

-- Power is summed from the gifts members sent: by sender and time.
CREATE INDEX IF NOT EXISTS gift_events_by_sender ON gift_events (sender, created_at);
