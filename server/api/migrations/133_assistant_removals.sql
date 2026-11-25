-- Asistanlıktan çıkarma onayı (owners, 25 Nov 2026): an agency owner no longer ends an assistant at once. The owner
-- asks; the assistant accepts (it ends), rejects (it stays) or disputes. After a rejection the owner may dispute.
-- A dispute goes to management, who talk to both and decide in the panel (remove or keep).
CREATE TABLE IF NOT EXISTS agency_assistant_removals (
  id              bigserial PRIMARY KEY,
  assistant_id    bigint NOT NULL REFERENCES agency_assistants(id),
  agency_id       uuid NOT NULL REFERENCES agencies(id),
  user_id         uuid NOT NULL REFERENCES users(id),
  asked_by        uuid NOT NULL REFERENCES users(id),
  -- pending: waiting for the assistant; accepted: ended by consent; rejected: the assistant said no (the owner may
  -- dispute); disputed: with management; removed / kept: management's decision; closed: the assignment ended another way.
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'disputed', 'removed', 'kept', 'closed')),
  disputed_by     text CHECK (disputed_by IN ('owner', 'assistant')),
  dispute_note    text,
  answered_at     timestamptz,
  disputed_at     timestamptz,
  resolved_at     timestamptz,
  resolved_by     uuid REFERENCES users(id),
  resolution_note text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
-- One open request per assistant (a double tap or two owners' phones can't open two).
CREATE UNIQUE INDEX IF NOT EXISTS agency_assistant_removals_open ON agency_assistant_removals (assistant_id) WHERE status IN ('pending', 'rejected', 'disputed');
CREATE INDEX IF NOT EXISTS agency_assistant_removals_status ON agency_assistant_removals (status, created_at);
CREATE INDEX IF NOT EXISTS agency_assistant_removals_user ON agency_assistant_removals (user_id);
