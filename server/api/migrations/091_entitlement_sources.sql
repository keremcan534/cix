-- Where an entitlement came from (economy.mjs grantInTx `source`), every source in one list. Three branches each set
-- the list without the others' (080 the room rocket's 'rocket'; 085 the level, event and task rewards'), and
-- migrations run in name order on a new database but in arrival order on the live one, so the last word is here.
ALTER TABLE entitlements DROP CONSTRAINT IF EXISTS entitlements_source_check;
ALTER TABLE entitlements ADD CONSTRAINT entitlements_source_check
  CHECK (source IN ('buy', 'bridge', 'migrate', 'admin', 'event', 'task', 'level', 'rocket'));
