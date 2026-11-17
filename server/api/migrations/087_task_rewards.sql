-- Görev ödülleri (task-rewards.mjs, docs/CANTA.md): an item the team ties to a task of Görevler in the finance panel
-- (Seviye ve görev ödülleri › Görev); whoever takes the task's reward finds it in Çantam (economy.mjs grantReward,
-- source 'task'), each time: a daily task gives it each day it is done (a term adds to the term already had).
-- Tasks on the server today: 'call' (the daily "1 görüntülü arama yap", call-log.mjs).
CREATE TABLE task_rewards (
  id         bigserial PRIMARY KEY,
  task       text NOT NULL CHECK (task IN ('call')),
  sku        text NOT NULL CHECK (sku ~ '^[a-z0-9-]{2,40}$'),
  -- null: the item's own term in the shop.
  days       smallint CHECK (days BETWEEN 1 AND 365),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid REFERENCES users(id)
);
CREATE UNIQUE INDEX task_rewards_one ON task_rewards (task, sku) WHERE deleted_at IS NULL;
