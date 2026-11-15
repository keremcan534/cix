-- The account Finance Control (the finance panel) acts as on this API (panel.mjs PANEL_ACTOR): role admin, so the
-- admin routes it may call check and record it like any admin; the panel user behind each action is in that
-- action's audit_events row. Not a person: deleted_at keeps it out of every list, ranking and push, and with no
-- device key, session or sign-in identity it can't sign in.
INSERT INTO users (id, name, role, deleted_at)
VALUES ('fc000000-0000-4000-8000-000000000001', 'Finance Control', 'admin', now())
ON CONFLICT (id) DO NOTHING;
