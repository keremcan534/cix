-- Etkinlik ödülü (events.mjs, docs/CANTA.md): an item the team attaches to an event in the panel (Etkinlikler). When
-- the event ends, everyone who came (event_participants) finds it in Çantam (economy.mjs grantReward, source 'event',
-- the event's title as its origin), once each. reward_done_at: the giving is over (reward_given: to how many).
ALTER TABLE events ADD COLUMN reward_sku text CHECK (reward_sku IS NULL OR reward_sku ~ '^[a-z0-9-]{2,40}$');
-- null: the item's own term in the shop.
ALTER TABLE events ADD COLUMN reward_days smallint CHECK (reward_days IS NULL OR reward_days BETWEEN 1 AND 365);
ALTER TABLE events ADD COLUMN reward_by uuid REFERENCES users(id);
ALTER TABLE events ADD COLUMN reward_given int;
ALTER TABLE events ADD COLUMN reward_done_at timestamptz;
CREATE INDEX events_reward_due ON events (ended_at) WHERE reward_sku IS NOT NULL AND reward_done_at IS NULL;
