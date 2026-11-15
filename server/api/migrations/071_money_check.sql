-- The money checks (money-check.mjs, docs/PARA_DENETIMI.md) on the live server watch the ledger from here on: the
-- rows written before this migration (the test server's past) are checked only on request
-- (GET /api/admin/money-check?all=1). On a new database this is 0, so everything is checked.
CREATE TABLE money_check_from (
  id        int PRIMARY KEY CHECK (id = 1),
  ledger_id bigint NOT NULL
);
INSERT INTO money_check_from VALUES (1, coalesce((SELECT max(id) FROM ledger), 0));
