-- Finance Control (the separate finance panel, docs/SUNUCU.md) receives every money movement from the ledger
-- (finance-sync.mjs). The ledger is append-only, so a cursor over its ids is enough: whatever is above the
-- cursor has not been sent yet.
CREATE TABLE finance_sync (
  id         int PRIMARY KEY CHECK (id = 1),
  last_id    bigint NOT NULL DEFAULT 0,
  last_ok_at timestamptz,
  last_error text
);
INSERT INTO finance_sync (id) VALUES (1);

-- Events the panel refused (e.g. a payment channel not defined there yet). Retried with a growing wait until
-- the panel accepts them; nothing is dropped.
CREATE TABLE finance_sync_failed (
  key        text PRIMARY KEY,
  ledger_id  bigint NOT NULL,
  event      jsonb NOT NULL,
  error      text NOT NULL,
  attempts   int NOT NULL DEFAULT 1,
  next_try   timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX finance_sync_failed_next ON finance_sync_failed(next_try);
