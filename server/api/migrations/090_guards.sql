-- Koruma (guards.mjs, docs/KORUMA.md): someone sends a person the Koruma Kartı gift and becomes their guardian. Every
-- gift the guardian sends them from then on adds its coins as points (1 coin = 1 point), from wherever it is sent
-- (gift_events: rooms, chats, profile, Aile, Bağlar, lucky gifts, the bag); a Türkiye day without one costs points at
-- the next midnight. The guardian with the most points, over the person's own threshold, shows on their profile.
CREATE TABLE guards (
  id bigserial PRIMARY KEY,
  guardian uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ward uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  points bigint NOT NULL DEFAULT 0 CHECK (points >= 0),
  started_at timestamptz NOT NULL DEFAULT now(),
  -- The Türkiye day the card was sent, the last day the guardian sent the ward a gift, and the last day whose
  -- midnight drop was worked out (once a day, whenever the sweep runs).
  first_day date NOT NULL,
  gift_day date NOT NULL,
  decayed_on date,
  ended_at timestamptz,
  CHECK (guardian <> ward)
);
CREATE UNIQUE INDEX guards_pair ON guards (guardian, ward) WHERE ended_at IS NULL;
CREATE INDEX guards_ward ON guards (ward, points DESC) WHERE ended_at IS NULL;
CREATE INDEX guards_guardian ON guards (guardian, points DESC) WHERE ended_at IS NULL;

-- A person's own Koruma settings: off (nobody may start guarding them; the guardians they have stay) and the points
-- the top guardian must reach to show on their profile, changed at most once a week.
CREATE TABLE guard_settings (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  off boolean NOT NULL DEFAULT false,
  threshold bigint NOT NULL DEFAULT 0 CHECK (threshold >= 0),
  threshold_at timestamptz
);

-- Every gift from a guardian to their ward adds its coins, whichever feature wrote it.
CREATE FUNCTION guard_points() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE guards SET points = points + NEW.total, gift_day = (now() AT TIME ZONE 'Europe/Istanbul')::date
   WHERE guardian = NEW.sender AND ward = NEW.recipient AND ended_at IS NULL;
  RETURN NULL;
END $$;
CREATE TRIGGER gift_events_guard_points AFTER INSERT ON gift_events FOR EACH ROW EXECUTE FUNCTION guard_points();
