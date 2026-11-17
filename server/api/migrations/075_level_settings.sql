-- Seviye ve VIP ayarları (levels.mjs, docs/SEVIYE_AYARLARI.md): each system's settings as the finance panel saved
-- them, whole. No row: the compiled values. `rev` grows with every save; the phones' catalog version follows it.
CREATE SEQUENCE level_settings_rev;
CREATE TABLE level_settings (
  system     text PRIMARY KEY CHECK (system IN ('vip', 'noble', 'wealth', 'charm', 'sub')),
  doc        jsonb NOT NULL,
  rev        bigint NOT NULL DEFAULT nextval('level_settings_rev'),
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- A level drop for inactivity (levels-admin.mjs): who, which system, from which level to which, the points before
-- and after, and how long they had been inactive. Shown to the person and to staff.
CREATE TABLE level_drops (
  id            bigserial PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  system        text NOT NULL CHECK (system IN ('vip', 'wealth', 'charm')),
  from_level    int NOT NULL,
  to_level      int NOT NULL,
  points_before bigint NOT NULL,
  points_after  bigint NOT NULL,
  idle_days     int NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX level_drops_user ON level_drops (user_id, system, created_at DESC);

-- Cömertlik and Yankı are summed from the ledger, which never changes: a drop takes points off here instead
-- (points = ledger sum - this, never below 0). VIP's points are a column (users.svip_xp) and drop there.
CREATE TABLE level_offsets (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  system  text NOT NULL CHECK (system IN ('wealth', 'charm')),
  points  bigint NOT NULL DEFAULT 0 CHECK (points >= 0),
  PRIMARY KEY (user_id, system)
);
