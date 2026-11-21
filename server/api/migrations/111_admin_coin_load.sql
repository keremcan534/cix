-- Yönetim jeton yüklemesi (owners, 22 Nov 2026: "yönetim olarak jeton noktası hizmeti vereceğiz"): a Süper yönetici
-- passes coins from management's own Jeton Noktası account to a person from the panel (jeton.mjs POST
-- /api/admin/jeton/load), and only management takes a wrong one back (POST /api/admin/jeton/reverse):
--   admin_load    management's bank → a person; actor = the admin; value_tl = what the person paid
--   admin_reverse the person → management's bank: the coins of one admin_load still unspent; reverses = that load
-- coin_transfers stays append-only: a take-back is a row of its own, at most one per load.
ALTER TABLE coin_transfers DROP CONSTRAINT coin_transfers_kind_check;
ALTER TABLE coin_transfers ADD CONSTRAINT coin_transfers_kind_check
  CHECK (kind IN ('wholesale', 'bank_sale', 'diamond_sale', 'admin_load', 'admin_reverse'));
ALTER TABLE coin_transfers ADD COLUMN reverses bigint REFERENCES coin_transfers(id);
CREATE UNIQUE INDEX coin_transfers_reverses ON coin_transfers(reverses) WHERE reverses IS NOT NULL;
ALTER TABLE coin_transfers ADD CONSTRAINT coin_transfers_reverses_kind CHECK ((kind = 'admin_reverse') = (reverses IS NOT NULL));
