-- VIP seti (docs/VIP_SETI.md, vip-set.mjs): the client's VIP 1–10 package as bag items the server adds once: each
-- level's moving frame, chat bubble and entry effect as the admins' own shop items (shop_items, off the shelf) and a
-- Seviye ödülü (level_rewards) giving it to whoever reaches that VIP level. One row per piece once it is added, so a
-- piece staff later delete or change in the panel is never added again. Only additions: an older server ignores it.
CREATE TABLE vip_set (
  slot     text PRIMARY KEY CHECK (slot ~ '^(frame|bubble|entry)-([1-9]|10)$'),
  item_id  text NOT NULL,
  rule_id  bigint,
  added_at timestamptz NOT NULL DEFAULT now()
);
