-- Selam (owners, 25 Nov 2026; messages.mjs): a woman greets at most greet_daily_women people a day ("Selam! 👋", the
-- Selam button's message), counted in auto_quota as 'greet' like the quick replies.
ALTER TABLE auto_quota DROP CONSTRAINT IF EXISTS auto_quota_kind_check;
ALTER TABLE auto_quota ADD CONSTRAINT auto_quota_kind_check CHECK (kind IN ('auto', 'quick', 'opener', 'greet'));
