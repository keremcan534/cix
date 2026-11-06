-- Contact filter (contact-filter.mjs): a message, profile field, room text or agency note that shares a phone
-- number, IBAN, e-mail, link or social media account is refused before it is saved. Each refusal is one row
-- here so moderators can see who keeps trying (GET /api/admin/sanctions/user). The refused text itself is never
-- stored, here or anywhere else (data minimisation): only who, which kind of contact detail, where, and when.
-- Rows older than 180 days are pruned by the API, and DELETE /api/me removes the person's rows. Too many in an
-- hour mute the person's messages for a while (018_contact_auto_mute.sql, sanctions.mjs contactStrike).
CREATE TABLE contact_refusals (
  id         bigserial PRIMARY KEY,
  -- Deliberately no foreign key: a refusal is counted on its own connection while the request's transaction may
  -- hold a lock on the person's users row, and a key check would wait on that lock for ever.
  user_id    uuid NOT NULL,
  -- phone, iban, payment, email, link, handle, social
  category   text NOT NULL CHECK (category ~ '^[a-z_]{2,20}$'),
  -- the entry point, e.g. dm, profile.bio, room.title, agency.join.note, signin.name
  place      text NOT NULL CHECK (place ~ '^[a-z_.]{2,40}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX contact_refusals_user ON contact_refusals (user_id, created_at DESC);
CREATE INDEX contact_refusals_time ON contact_refusals (created_at);
