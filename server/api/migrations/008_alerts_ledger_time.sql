-- The health warnings (alerts.mjs) read the last hour of the ledger: diamonds received per account and test
-- top-ups. Without an index on the time that is a scan of the whole ledger once a minute.
CREATE INDEX IF NOT EXISTS ledger_created_at ON ledger(created_at);
