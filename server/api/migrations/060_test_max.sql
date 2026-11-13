-- Test servers only (ALLOW_TEST_TOPUP=1): the Cömertlik and Yankı points the "everything to the top" test button
-- set. wallet.mjs withTestBoost reads them as a floor while play money is on and ignores them otherwise.
ALTER TABLE users ADD COLUMN IF NOT EXISTS test_wealth bigint NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS test_charm bigint NOT NULL DEFAULT 0;
