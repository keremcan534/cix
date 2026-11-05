-- Sanctions (docs/YAPTIRIM.md): mutes, account bans and device bans in one place. Every sanction is its own
-- row in user_sanctions with its own life (pending → active → lifted, or it simply runs out by server time);
-- the detail tables hold what only one kind needs. Lifting one never touches another. Nothing here is ever
-- deleted: the triggers at the end refuse DELETE, and the audit log refuses UPDATE too.
--
-- users.banned_until (002) was the old account ban. Its running bans move here and the column goes, so there
-- is one mechanism, not two. room_bans (003) stays: it is "out of this room" (kick / blacklist), a room access
-- rule, not a mute; its changes are written to the sanction audit log.

-- The 15 standard violation categories. title is what staff pick, public_text what the person sees.
CREATE TABLE sanction_reasons (
  code        text PRIMARY KEY CHECK (code ~ '^[a-z_]{2,32}$'),
  title       text NOT NULL,
  public_text text NOT NULL,
  sort        int NOT NULL,
  active      boolean NOT NULL DEFAULT true
);
INSERT INTO sanction_reasons (code, title, public_text, sort) VALUES
  ('insult',        'Hakaret ve küfür',               'Hakaret veya küfür içeren davranış', 1),
  ('threat',        'Tehdit',                         'Başkalarını tehdit etme', 2),
  ('harassment',    'Taciz',                          'Başka bir kullanıcıyı rahatsız etme veya taciz', 3),
  ('spam',          'Spam',                           'Tekrarlanan veya istenmeyen mesajlar', 4),
  ('fraud',         'Dolandırıcılık girişimi',        'Dolandırıcılık girişimi', 5),
  ('advertising',   'Reklam ve izinsiz tanıtım',      'İzinsiz reklam veya tanıtım', 6),
  ('fake_account',  'Sahte hesap',                    'Sahte hesap kullanımı', 7),
  ('impersonation', 'Başka kullanıcıyı taklit etme',  'Başka bir kişiyi taklit etme', 8),
  ('inappropriate', 'Uygunsuz içerik',                'Uygunsuz içerik paylaşımı', 9),
  ('hate',          'Nefret söylemi',                 'Nefret söylemi', 10),
  ('disruption',    'Oda düzenini bozma',             'Oda düzenini bozma', 11),
  ('abuse_of_power','Yetki kötüye kullanımı',         'Verilen yetkinin kötüye kullanılması', 12),
  ('ban_evasion',   'Ban aşma girişimi',              'Uygulanan bir yaptırımı aşma girişimi', 13),
  ('security',      'Güvenlik ihlali',                'Platform güvenliğini tehlikeye atan davranış', 14),
  ('other',         'Diğer',                          'Topluluk kurallarının ihlali', 15);

-- Devices: one row per phone as far as we can tell. Only hashes of identifiers are kept (sha256 with a
-- prefix per kind), never the raw values; model/os are coarse labels for staff. install_hash is the app's own
-- random key (new on every install); hardware_hash is what the OS gives every app from the same publisher
-- (Android ID, iOS identifierForVendor); keychain_hash is an id kept in the iOS keychain / Android keystore
-- that can survive a reinstall. risk_status is a flag for staff, never a sanction by itself.
CREATE TABLE device_registry (
  id                         bigserial PRIMARY KEY,
  platform                   text NOT NULL CHECK (platform IN ('android', 'ios', 'web', 'unknown')),
  install_hash               text UNIQUE,
  hardware_hash              text,
  keychain_hash              text,
  model                      text NOT NULL DEFAULT '' CHECK (char_length(model) <= 60),
  os_version                 text NOT NULL DEFAULT '' CHECK (char_length(os_version) <= 30),
  app_version                text NOT NULL DEFAULT '' CHECK (char_length(app_version) <= 30),
  -- unverified until Play Integrity / App Attest is wired (docs/YAPTIRIM.md); then verified or failed.
  device_verification_status text NOT NULL DEFAULT 'unverified' CHECK (device_verification_status IN ('unverified', 'verified', 'failed')),
  risk_status                text NOT NULL DEFAULT 'normal' CHECK (risk_status IN ('normal', 'reinstalled', 'changed', 'shared', 'evasion_suspect')),
  risk_note                  text NOT NULL DEFAULT '',
  registration_status        text NOT NULL DEFAULT 'active' CHECK (registration_status IN ('active', 'merged')),
  first_seen_at              timestamptz NOT NULL DEFAULT now(),
  last_seen_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX device_registry_hardware ON device_registry(hardware_hash) WHERE hardware_hash IS NOT NULL;
CREATE INDEX device_registry_keychain ON device_registry(keychain_hash) WHERE keychain_hash IS NOT NULL;

-- Which accounts used which device (a shared family phone has several).
CREATE TABLE device_accounts (
  device_id     bigint NOT NULL REFERENCES device_registry(id),
  user_id       uuid NOT NULL REFERENCES users(id),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (device_id, user_id)
);
CREATE INDEX device_accounts_user ON device_accounts(user_id, last_seen_at DESC);

-- A session remembers the device it was opened on, so a device ban ends it and refuses its calls.
-- scope 'appeal': a banned person's short session that may only read their sanctions and send an appeal.
ALTER TABLE sessions
  ADD COLUMN device_id bigint REFERENCES device_registry(id),
  ADD COLUMN scope     text NOT NULL DEFAULT 'full' CHECK (scope IN ('full', 'appeal'));
CREATE INDEX sessions_device ON sessions(device_id) WHERE device_id IS NOT NULL;

-- Every sanction. kind:
--   mute_room_text / mute_room_voice   in one room (room_id)
--   mute_global_text                   every room; DMs too when user_mute_records.include_dm
--   mute_global_voice                  every room's mic; calls too when user_mute_records.include_calls
--   mute_all                           text, mic, DMs and calls
--   account_ban                        the account (account_bans)
--   device_ban                         one device (device_bans), whoever uses it
-- expires_at NULL with is_permanent: until staff lift it (indefinite mute / lifetime ban).
-- status: pending (waits for an approver: heavy or automatic), active, rejected (approver said no), lifted.
-- An active one whose expires_at has passed has simply ended; nothing needs to run for that.
CREATE TABLE user_sanctions (
  id                 bigserial PRIMARY KEY,
  user_id            uuid NOT NULL REFERENCES users(id),
  sanction_type      text NOT NULL CHECK (sanction_type IN ('mute_room_text', 'mute_room_voice', 'mute_global_text', 'mute_global_voice', 'mute_all', 'account_ban', 'device_ban')),
  scope              text NOT NULL CHECK (scope IN ('room', 'global', 'account', 'device')),
  room_id            uuid REFERENCES rooms(id),
  reason_code        text NOT NULL REFERENCES sanction_reasons(code),
  -- Shown to the person (defaults to the category's public text).
  reason_description text NOT NULL CHECK (char_length(reason_description) BETWEEN 1 AND 300),
  -- Staff only: never sent to the person.
  internal_note      text NOT NULL DEFAULT '' CHECK (char_length(internal_note) <= 2000),
  start_at           timestamptz NOT NULL DEFAULT now(),
  expires_at         timestamptz,
  is_permanent       boolean NOT NULL DEFAULT false,
  status             text NOT NULL DEFAULT 'active' CHECK (status IN ('pending', 'active', 'rejected', 'lifted')),
  -- Who: NULL for the automatic system. created_role is what they acted as (room_admin, room_owner,
  -- moderator, admin, system) and is what the person sees as "applied by".
  created_by         uuid REFERENCES users(id),
  created_role       text NOT NULL CHECK (created_role IN ('room_admin', 'room_owner', 'moderator', 'admin', 'system')),
  source             text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'policy', 'auto', 'report', 'legacy')),
  report_id          bigint REFERENCES reports(id),
  policy_step        int,
  approved_by        uuid REFERENCES users(id),
  approved_at        timestamptz,
  revoked_by         uuid REFERENCES users(id),
  revoked_at         timestamptz,
  revocation_reason  text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CHECK ((scope = 'room') = (room_id IS NOT NULL)),
  CHECK (scope = CASE WHEN sanction_type IN ('mute_room_text', 'mute_room_voice') THEN 'room'
                      WHEN sanction_type = 'account_ban' THEN 'account'
                      WHEN sanction_type = 'device_ban' THEN 'device' ELSE 'global' END),
  CHECK (is_permanent = (expires_at IS NULL)),
  CHECK (expires_at IS NULL OR expires_at > start_at),
  CHECK ((status = 'lifted') = (revoked_at IS NOT NULL))
);
CREATE INDEX user_sanctions_user ON user_sanctions(user_id, created_at DESC);
CREATE INDEX user_sanctions_live ON user_sanctions(user_id, sanction_type) WHERE status = 'active';
CREATE INDEX user_sanctions_pending ON user_sanctions(created_at) WHERE status = 'pending';

-- Mute details: which channels a global mute covers.
CREATE TABLE user_mute_records (
  sanction_id   bigint PRIMARY KEY REFERENCES user_sanctions(id),
  include_dm    boolean NOT NULL DEFAULT false,
  include_calls boolean NOT NULL DEFAULT false
);

-- Account ban details: how many sessions it ended when it started.
CREATE TABLE account_bans (
  sanction_id    bigint PRIMARY KEY REFERENCES user_sanctions(id),
  sessions_ended int NOT NULL DEFAULT 0
);

-- Device ban details. related_user_id is the account it was given over (the sanction's user); the ban is on
-- the device, and other accounts that used it are not sanctioned by it.
CREATE TABLE device_bans (
  sanction_id        bigint PRIMARY KEY REFERENCES user_sanctions(id),
  device_registry_id bigint NOT NULL REFERENCES device_registry(id),
  related_user_id    uuid NOT NULL REFERENCES users(id),
  sessions_ended     int NOT NULL DEFAULT 0
);
CREATE INDEX device_bans_device ON device_bans(device_registry_id);

-- Escalation per category: step n applies on the n-th sanctioned violation of that category inside
-- window_days (the last step repeats after that). auto: the automatic system may apply it without a person;
-- requires_approval: it waits as pending until someone with sanction.approve says yes. Lifetime bans and
-- device bans always need approval when they come from a policy (the server enforces that, not this table).
CREATE TABLE sanction_policies (
  reason_code       text NOT NULL REFERENCES sanction_reasons(code),
  step              int NOT NULL CHECK (step BETWEEN 1 AND 10),
  sanction_type     text NOT NULL CHECK (sanction_type IN ('mute_room_text', 'mute_room_voice', 'mute_global_text', 'mute_global_voice', 'mute_all', 'account_ban', 'device_ban')),
  minutes           int CHECK (minutes IS NULL OR minutes BETWEEN 1 AND 5256000),
  window_days       int NOT NULL DEFAULT 90 CHECK (window_days BETWEEN 1 AND 3650),
  auto              boolean NOT NULL DEFAULT false,
  requires_approval boolean NOT NULL DEFAULT false,
  updated_by        uuid REFERENCES users(id),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (reason_code, step)
);
-- The spec's example ladder for the chatty categories: 5 min, 30 min, 2 h, 24 h, 7 days of global text mute.
INSERT INTO sanction_policies (reason_code, step, sanction_type, minutes, auto)
SELECT r.code, s.step, 'mute_global_text', s.minutes, s.step <= 2
  FROM sanction_reasons r, (VALUES (1, 5), (2, 30), (3, 120), (4, 1440), (5, 10080)) AS s(step, minutes)
 WHERE r.code IN ('insult', 'spam', 'advertising', 'disruption', 'harassment', 'other');
-- Heavier categories start with an account ban and always wait for a person.
INSERT INTO sanction_policies (reason_code, step, sanction_type, minutes, requires_approval)
SELECT r.code, s.step, 'account_ban', s.minutes, true
  FROM sanction_reasons r, (VALUES (1, 1440), (2, 10080), (3, 43200), (4, NULL::int)) AS s(step, minutes)
 WHERE r.code IN ('threat', 'fraud', 'hate', 'fake_account', 'impersonation', 'inappropriate', 'abuse_of_power', 'ban_evasion', 'security');

-- Appeals: one open appeal per sanction and person (a device ban can be appealed by every account that used
-- the device: a shared phone). outcome upheld / reduced / lifted / needs_review (stays open).
CREATE TABLE sanction_appeals (
  id            bigserial PRIMARY KEY,
  sanction_id   bigint NOT NULL REFERENCES user_sanctions(id),
  user_id       uuid NOT NULL REFERENCES users(id),
  body          text NOT NULL CHECK (char_length(body) BETWEEN 10 AND 1000),
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'needs_review', 'upheld', 'reduced', 'lifted')),
  reviewed_by   uuid REFERENCES users(id),
  decision_note text,
  decided_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX sanction_appeals_one_open ON sanction_appeals(sanction_id, user_id) WHERE status IN ('open', 'needs_review');
CREATE INDEX sanction_appeals_queue ON sanction_appeals(created_at) WHERE status IN ('open', 'needs_review');

-- Evidence staff attach: a note, a link, a report or message id.
CREATE TABLE moderation_evidence (
  id          bigserial PRIMARY KEY,
  sanction_id bigint NOT NULL REFERENCES user_sanctions(id),
  kind        text NOT NULL CHECK (kind IN ('note', 'link', 'report', 'message')),
  content     text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  added_by    uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX moderation_evidence_sanction ON moderation_evidence(sanction_id);

-- Extra moderation permissions on top of the role (sanctions.mjs PERMS). users.role admin holds them all.
CREATE TABLE admin_permissions (
  user_id    uuid NOT NULL REFERENCES users(id),
  permission text NOT NULL CHECK (permission ~ '^sanction\.[a-z_]+$'),
  granted_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, permission)
);

-- Who did what, append only. Refusals (permission denied) are written too.
CREATE TABLE sanction_audit_logs (
  id          bigserial PRIMARY KEY,
  actor       uuid REFERENCES users(id),
  actor_role  text NOT NULL,
  action      text NOT NULL,
  sanction_id bigint REFERENCES user_sanctions(id),
  target_user uuid REFERENCES users(id),
  device_id   bigint REFERENCES device_registry(id),
  result      text NOT NULL DEFAULT 'ok' CHECK (result IN ('ok', 'denied', 'blocked')),
  detail      jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sanction_audit_target ON sanction_audit_logs(target_user, id DESC);
CREATE INDEX sanction_audit_sanction ON sanction_audit_logs(sanction_id, id);

CREATE FUNCTION sanction_keep() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'sanction records are never deleted or rewritten (%)', TG_TABLE_NAME;
END $$;
CREATE TRIGGER sanction_audit_append_only BEFORE UPDATE OR DELETE ON sanction_audit_logs FOR EACH ROW EXECUTE FUNCTION sanction_keep();
CREATE TRIGGER user_sanctions_keep BEFORE DELETE ON user_sanctions FOR EACH ROW EXECUTE FUNCTION sanction_keep();
CREATE TRIGGER sanction_appeals_keep BEFORE DELETE ON sanction_appeals FOR EACH ROW EXECUTE FUNCTION sanction_keep();
CREATE TRIGGER moderation_evidence_keep BEFORE DELETE ON moderation_evidence FOR EACH ROW EXECUTE FUNCTION sanction_keep();
CREATE TRIGGER device_bans_keep BEFORE DELETE ON device_bans FOR EACH ROW EXECUTE FUNCTION sanction_keep();

-- The old bans that are still running become account bans; then the old column goes.
WITH old AS (
  SELECT id, banned_until FROM users WHERE banned_until IS NOT NULL AND banned_until > now()
), ins AS (
  INSERT INTO user_sanctions (user_id, sanction_type, scope, reason_code, reason_description, start_at, expires_at, is_permanent, created_role, source, internal_note)
  SELECT id, 'account_ban', 'account', 'other', 'Topluluk kurallarının ihlali', now(), banned_until, false, 'admin', 'legacy', 'Eski askıya alma kaydından taşındı'
    FROM old RETURNING id
)
INSERT INTO account_bans (sanction_id) SELECT id FROM ins;
ALTER TABLE users DROP COLUMN banned_until;
