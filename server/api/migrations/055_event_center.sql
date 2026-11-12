-- Etkinlik Merkezi (events.mjs, event-rules.mjs): events a room owner (or the room's Süper Yönetici) applies for,
-- the platform's review, reservations, who came while it ran, and every change in a log. The old Oda etkinlikleri
-- (036_room_events.sql) stay for installed apps; new apps use these.
--
-- One row per event carries its application (status: draft, review, approved, rejected, cancelled) and, apart from
-- it, its run (started_at, ended_at, end_reason). Reservations and participants are their own rows.

CREATE TABLE IF NOT EXISTS event_categories (
  id         text PRIMARY KEY CHECK (id ~ '^[a-z0-9-]{2,24}$'),
  name       text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 24),
  -- An Ionicons glyph name: the app draws it until the category has its own art.
  icon       text NOT NULL DEFAULT 'sparkles' CHECK (icon ~ '^[a-z0-9-]{1,40}$'),
  -- The theme an event of this category starts with (event-rules.mjs THEMES); the owner may pick another.
  theme      text NOT NULL DEFAULT 'sade' CHECK (char_length(theme) BETWEEN 1 AND 24),
  sort       int NOT NULL DEFAULT 0,
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO event_categories (id, name, icon, theme, sort) VALUES
  ('eglence',  'Eğlence',              'happy',               'yildiz',    10),
  ('muzik',    'Müzik',                'musical-notes',       'sahne',     20),
  ('tanisma',  'Tanışma',              'hand-left',           'ilk-selam', 30),
  ('yarisma',  'Yarışma',              'trophy',              'kupa',      40),
  ('ozel-gun', 'Özel Günler',          'gift',                'pasta',     50),
  ('aile',     'Aile Etkinlikleri',    'people',              'ocak',      60),
  ('cift',     'Çiftler Etkinlikleri', 'heart',               'iki-kalp',  70),
  ('diger',    'Diğer',                'ellipsis-horizontal', 'sade',      80)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS events (
  id            bigserial PRIMARY KEY,
  room_id       uuid NOT NULL REFERENCES rooms(id),
  -- The room's owner when the event was made: the one who answers for it (strikes, limits).
  owner_id      uuid NOT NULL REFERENCES users(id),
  created_by    uuid NOT NULL REFERENCES users(id),
  category      text NOT NULL REFERENCES event_categories(id),
  theme         text NOT NULL DEFAULT 'sade' CHECK (char_length(theme) BETWEEN 1 AND 24),
  title         text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 40),
  description   text NOT NULL DEFAULT '' CHECK (char_length(description) <= 300),
  rules         text NOT NULL DEFAULT '' CHECK (char_length(rules) <= 500),
  cover_url     text CHECK (cover_url IS NULL OR char_length(cover_url) <= 500),
  starts_at     timestamptz NOT NULL,
  ends_at       timestamptz NOT NULL,
  -- null: no limit beyond the platform's (event_max_capacity).
  capacity      int CHECK (capacity IS NULL OR capacity BETWEEN 2 AND 100000),
  -- Whether people reserve a place; without it the event is still listed and anyone may come.
  reservation   boolean NOT NULL DEFAULT true,
  -- public: Etkinlik Alanı lists it; room: only the room and a shared link show it.
  visibility    text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'room')),
  status        text NOT NULL DEFAULT 'review' CHECK (status IN ('draft', 'review', 'approved', 'rejected', 'cancelled')),
  reject_reason text CHECK (reject_reason IS NULL OR char_length(reject_reason) <= 300),
  reviewed_by   uuid REFERENCES users(id),
  reviewed_at   timestamptz,
  cancel_reason text CHECK (cancel_reason IS NULL OR char_length(cancel_reason) <= 300),
  cancelled_by  uuid REFERENCES users(id),
  cancelled_at  timestamptz,
  submitted_at  timestamptz,
  started_at    timestamptz,
  ended_at      timestamptz,
  end_reason    text CHECK (end_reason IS NULL OR end_reason IN ('owner', 'time', 'room_closed', 'not_started', 'admin')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS events_list ON events (status, starts_at);
CREATE INDEX IF NOT EXISTS events_room ON events (room_id, starts_at DESC);
CREATE INDEX IF NOT EXISTS events_owner ON events (owner_id, created_at DESC);
-- One running event per room, whatever two phones or the sweep do at once.
CREATE UNIQUE INDEX IF NOT EXISTS events_one_running ON events (room_id) WHERE started_at IS NOT NULL AND ended_at IS NULL;

CREATE TABLE IF NOT EXISTS event_reservations (
  event_id   bigint NOT NULL REFERENCES events(id),
  user_id    uuid NOT NULL REFERENCES users(id),
  -- confirmed → attended / missed when the event ends; cancelled by the person (or with the event).
  -- waiting is kept for a later waiting list.
  status     text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'waiting', 'cancelled', 'attended', 'missed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);
CREATE INDEX IF NOT EXISTS event_reservations_user ON event_reservations (user_id, created_at DESC);

-- Who was in the room while the event ran (the voice room's joins, and everyone in it at the start).
CREATE TABLE IF NOT EXISTS event_participants (
  event_id  bigint NOT NULL REFERENCES events(id),
  user_id   uuid NOT NULL REFERENCES users(id),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);

-- Every change to an event: who (null: the server's own sweep), what, and the details.
CREATE TABLE IF NOT EXISTS event_log (
  id         bigserial PRIMARY KEY,
  event_id   bigint NOT NULL REFERENCES events(id),
  actor      uuid REFERENCES users(id),
  action     text NOT NULL CHECK (char_length(action) <= 24),
  detail     jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS event_log_event ON event_log (event_id, id);
