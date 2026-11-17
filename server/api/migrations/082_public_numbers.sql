-- Everyone's own number (users.public_no; docs/PROFIL_GEREKSINIMLERI.md "ID'yi sunucu üretmeli", docs/KIMLIK_NUMARASI.md).
-- The app used to work out a profile's 12-digit ID from the account's uuid (app data/profile displayId) and a room's
-- 8-digit ID from the room's uuid (roomCode). Neither was unique (displayId has about a million values), the server
-- couldn't find anyone by them, and a room's changed every time its owner opened it again (a new rooms row). Now each
-- account has its own number, given here and never changed, and a room's ID is its owner's number.
--   - An account's number is the one the old app shows for it where no older account has that one (older apps keep
--     showing the right number), else a free random one. Every way an account is made gets one (the trigger).
--   - Every number has the old app's shape, 100000000000 + 7919 × k (k < 1 010 228, so 10[0-7] and 9 digits): the
--     contact filter lets a real user ID through by that shape (contact-filter.mjs userId) and holds one that hides a
--     phone number ('105321234567'). Room for about a million accounts; past that the shape needs widening there too.

-- The old app's number for an account (app data/profile seedOf and displayId, over the uuid's text).
CREATE FUNCTION app_public_no(u uuid) RETURNS bigint LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  s text := u::text;
  h bigint := 17;
BEGIN
  FOR i IN 1..length(s) LOOP
    h := (h * 31 + ascii(substr(s, i, 1))) % 1000003;
  END LOOP;
  RETURN 100000000000 + (h * 7919) % 900000000000;
END $$;

-- A free number: `n` when nobody has it, else a random one of the same shape nobody has.
CREATE FUNCTION free_public_no(n bigint) RETURNS bigint LANGUAGE plpgsql AS $$
BEGIN
  WHILE n IS NULL OR EXISTS (SELECT 1 FROM users WHERE public_no = n) LOOP
    n := 100000000000 + floor(random() * 1010228)::bigint * 7919;
  END LOOP;
  RETURN n;
END $$;

ALTER TABLE users ADD COLUMN public_no bigint;
-- The accounts there are: the old number for the oldest account that had it, a free random one for the others.
UPDATE users u SET public_no = x.n
  FROM (SELECT id, app_public_no(id) AS n, row_number() OVER (PARTITION BY app_public_no(id) ORDER BY created_at, id) AS k FROM users) x
 WHERE u.id = x.id AND x.k = 1;
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM users WHERE public_no IS NULL ORDER BY created_at, id LOOP
    UPDATE users SET public_no = free_public_no(NULL) WHERE id = r.id;
  END LOOP;
END $$;
ALTER TABLE users ALTER COLUMN public_no SET NOT NULL;
ALTER TABLE users ADD CONSTRAINT users_public_no_shape CHECK (public_no BETWEEN 100000000000 AND 107999999999 AND (public_no - 100000000000) % 7919 = 0);
CREATE UNIQUE INDEX users_public_no ON users (public_no);

-- A new account: its old-app number where free, else a free random one.
CREATE FUNCTION users_public_no() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.public_no IS NULL THEN
    NEW.public_no := free_public_no(app_public_no(NEW.id));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER users_public_no BEFORE INSERT ON users FOR EACH ROW EXECUTE FUNCTION users_public_no();
