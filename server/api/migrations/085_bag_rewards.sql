-- Çantam (economy.mjs grantReward, docs/CANTA.md): what someone owns came from Çarşı (buy, bridge, migrate), from
-- the staff (admin) or from a reward: an event they attended (event), a task (task), a level or VIP reached (level).
-- `origin` says which one in a few words for the bag ("Yaz Festivali", "VIP 5"); written with the row, never changed.
ALTER TABLE entitlements DROP CONSTRAINT IF EXISTS entitlements_source_check;
ALTER TABLE entitlements ADD CONSTRAINT entitlements_source_check CHECK (source IN ('buy', 'bridge', 'migrate', 'admin', 'event', 'task', 'level'));
ALTER TABLE entitlements ADD COLUMN origin text CHECK (origin IS NULL OR length(origin) BETWEEN 1 AND 60);

-- Seviye ödülleri (level-rewards.mjs): an item the team ties to a level of VIP, Cömertlik or Yankı; whoever has the
-- level gets it once. `days` NULL: the shop's term. A rule taken away is kept (deleted_at) for the claims below.
CREATE TABLE level_rewards (
  id          bigserial PRIMARY KEY,
  system      text NOT NULL CHECK (system IN ('vip', 'wealth', 'charm')),
  level       smallint NOT NULL CHECK (level BETWEEN 1 AND 200),
  sku         text NOT NULL CHECK (sku ~ '^[a-z0-9-]{2,40}$'),
  days        smallint CHECK (days BETWEEN 1 AND 365),
  created_by  uuid REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz,
  deleted_by  uuid REFERENCES users(id)
);
CREATE UNIQUE INDEX level_rewards_one ON level_rewards (system, level, sku) WHERE deleted_at IS NULL;

-- Each rule once per person, given or not: a reward that adds nothing (the item had for good, a term past the
-- furthest ahead) isn't tried again at every read.
CREATE TABLE level_reward_claims (
  rule_id  bigint NOT NULL REFERENCES level_rewards(id),
  user_id  uuid NOT NULL REFERENCES users(id),
  given    boolean NOT NULL,
  at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (rule_id, user_id)
);
