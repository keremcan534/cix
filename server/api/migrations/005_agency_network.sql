-- Agency network: platform → top agency → sub-agency → streamer, performance-based commission tiers, the
-- commission ledger, payouts, transfers and independence, staff permissions, BD responsibility and the audit
-- log. docs/AJANS_HIYERARSI.md explains the rules; agency-lib.mjs is the engine.
--
-- Financial rows are append-only. Corrections are new rows (reversal, adjustment), never edits; triggers at
-- the end refuse DELETE everywhere and refuse UPDATE of amounts. Rates, settings and the parent relation are
-- kept as dated history, so a commission is always computed with the rules in force when the income happened.

-- --- Settings: every change is a new row; the current value of a key is its latest row ----------------------
CREATE TABLE agency_settings (
  id         bigserial PRIMARY KEY,
  key        text NOT NULL CHECK (key ~ '^[a-z_]{2,40}$'),
  value      jsonb NOT NULL,
  reason     text NOT NULL DEFAULT '' CHECK (char_length(reason) <= 300),
  set_by     uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agency_settings_key ON agency_settings(key, created_at DESC, id DESC);

-- --- Agencies ------------------------------------------------------------------------------------------------
-- level 1 = top agency (parent: the platform), 2 = sub-agency. The model allows deeper levels; the API refuses
-- anything past the max_levels setting (2 in the first release).
CREATE TABLE agencies (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Invite code (also the invite link's last part). The server resolves it; the app never decides the agency.
  code               text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9]{6,10}$'),
  name               text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 60),
  parent_id          uuid REFERENCES agencies(id),
  level              smallint NOT NULL CHECK (level >= 1),
  owner_id           uuid REFERENCES users(id),
  status             text NOT NULL CHECK (status IN ('draft', 'pending', 'approved', 'rejected', 'suspended', 'closed')),
  -- Who decides a pending application: the parent agency first (applications from outside), then the centre.
  pending_with       text CHECK (pending_with IN ('parent', 'center')),
  country            text NOT NULL DEFAULT '' CHECK (char_length(country) <= 60),
  region             text NOT NULL DEFAULT '' CHECK (char_length(region) <= 60),
  contact_name       text NOT NULL DEFAULT '' CHECK (char_length(contact_name) <= 60),
  contact_phone      text NOT NULL DEFAULT '' CHECK (char_length(contact_phone) <= 30),
  contact_email      text NOT NULL DEFAULT '' CHECK (char_length(contact_email) <= 120),
  expected_streamers int NOT NULL DEFAULT 0 CHECK (expected_streamers BETWEEN 0 AND 100000),
  description        text NOT NULL DEFAULT '' CHECK (char_length(description) <= 1000),
  -- Right to found sub-agencies, set by the centre per agency (on top of the global setting).
  can_create_subs    boolean NOT NULL DEFAULT true,
  -- Performance inputs the centre keeps: operational activity (0–100). Violations are their own table.
  ops_score          smallint NOT NULL DEFAULT 50 CHECK (ops_score BETWEEN 0 AND 100),
  -- Current commission tier of a sub-agency (key in the tiers setting); NULL for top agencies.
  tier               text,
  -- The performance engine leaves the tier alone until then (a manual decision by the centre holds).
  tier_hold_until    timestamptz,
  acquired_by_bd     uuid REFERENCES users(id),
  created_by         uuid REFERENCES users(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  approved_at        timestamptz,
  closed_at          timestamptz,
  CHECK ((parent_id IS NULL) = (level = 1)),
  CHECK (parent_id <> id)
);
CREATE INDEX agencies_parent ON agencies(parent_id);
-- No two open agencies with the same name; one open agency per manager.
CREATE UNIQUE INDEX agencies_open_name ON agencies (lower(name)) WHERE status NOT IN ('rejected', 'closed');
CREATE UNIQUE INDEX agencies_open_owner ON agencies (owner_id) WHERE status IN ('draft', 'pending', 'approved', 'suspended');

CREATE TABLE agency_status_history (
  id          bigserial PRIMARY KEY,
  agency_id   uuid NOT NULL REFERENCES agencies(id),
  from_status text,
  to_status   text NOT NULL,
  actor_id    uuid REFERENCES users(id),
  note        text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agency_status_history_agency ON agency_status_history(agency_id, id);

-- Which agency was the parent when (AgencyHierarchy). NULL parent = directly under the platform.
CREATE TABLE agency_parents (
  id         bigserial PRIMARY KEY,
  agency_id  uuid NOT NULL REFERENCES agencies(id),
  parent_id  uuid REFERENCES agencies(id),
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to   timestamptz,
  actor_id   uuid REFERENCES users(id),
  reason     text NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX agency_parents_open ON agency_parents(agency_id) WHERE valid_to IS NULL;
CREATE INDEX agency_parents_agency ON agency_parents(agency_id, valid_from);

-- --- Streamers (AgencyPublishers) ----------------------------------------------------------------------------
-- One row per membership. The partial unique index is the one-agency rule: a streamer has at most one open
-- membership, whatever the code path.
CREATE TABLE agency_streamers (
  id          bigserial PRIMARY KEY,
  streamer_id uuid NOT NULL REFERENCES users(id),
  agency_id   uuid NOT NULL REFERENCES agencies(id),
  method      text NOT NULL CHECK (method IN ('link', 'code', 'invite', 'application', 'admin', 'transfer')),
  contract    text NOT NULL DEFAULT 'approved' CHECK (contract IN ('pending', 'approved')),
  joined_at   timestamptz NOT NULL DEFAULT now(),
  ended_at    timestamptz,
  end_reason  text,
  transfer_id bigint,
  created_by  uuid REFERENCES users(id)
);
CREATE UNIQUE INDEX agency_streamers_one_open ON agency_streamers(streamer_id) WHERE ended_at IS NULL;
CREATE INDEX agency_streamers_agency ON agency_streamers(agency_id, joined_at);
CREATE INDEX agency_streamers_time ON agency_streamers(streamer_id, joined_at);

-- Join applications (user → agency, by code, link or form) and invites (agency → user).
CREATE TABLE agency_requests (
  id         bigserial PRIMARY KEY,
  agency_id  uuid NOT NULL REFERENCES agencies(id),
  user_id    uuid NOT NULL REFERENCES users(id),
  kind       text NOT NULL CHECK (kind IN ('join', 'invite')),
  method     text NOT NULL CHECK (method IN ('code', 'link', 'application', 'invite')),
  note       text NOT NULL DEFAULT '' CHECK (char_length(note) <= 300),
  status     text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid REFERENCES users(id),
  decided_at timestamptz
);
CREATE UNIQUE INDEX agency_requests_open ON agency_requests(agency_id, user_id) WHERE status = 'pending';
CREATE INDEX agency_requests_user ON agency_requests(user_id) WHERE status = 'pending';

-- --- Commission rules ----------------------------------------------------------------------------------------
-- An agency's own rate over time (AgencyCommissionRules). The rate in force at time t is the latest row with
-- effective_from <= t; a row dated in the future is an announced change. parent_floor = the share the parent
-- keeps at least (the minimum parent commission when the row was written; 0 when the setting allows it).
CREATE TABLE agency_rates (
  id             bigserial PRIMARY KEY,
  agency_id      uuid NOT NULL REFERENCES agencies(id),
  rate           numeric(6,4) NOT NULL CHECK (rate >= 0 AND rate <= 1),
  parent_floor   numeric(6,4) NOT NULL DEFAULT 0 CHECK (parent_floor >= 0 AND parent_floor <= 1),
  tier           text,
  source         text NOT NULL CHECK (source IN ('default', 'tier', 'manual', 'transfer', 'independence')),
  effective_from timestamptz NOT NULL,
  reason         text NOT NULL DEFAULT '' CHECK (char_length(reason) <= 300),
  run_id         bigint,
  set_by         uuid REFERENCES users(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agency_rates_at ON agency_rates(agency_id, effective_from DESC, id DESC);

-- Transition commission (AgencyTransitionCommissions): after a sub-agency becomes independent, its former
-- parent may keep a share of the agency's own streamers' income for a set time, carved out of the pool.
CREATE TABLE agency_transitions (
  id            bigserial PRIMARY KEY,
  agency_id     uuid NOT NULL REFERENCES agencies(id),
  old_parent_id uuid NOT NULL REFERENCES agencies(id),
  rate          numeric(6,4) NOT NULL CHECK (rate > 0 AND rate <= 1),
  starts_at     timestamptz NOT NULL,
  ends_at       timestamptz NOT NULL,
  -- 'existing' = only streamers who were in the agency when the transition started.
  scope         text NOT NULL DEFAULT 'existing' CHECK (scope IN ('all', 'existing')),
  income_types  text[] NOT NULL DEFAULT '{}',
  transfer_id   bigint,
  reason        text NOT NULL DEFAULT '',
  created_by    uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX agency_transitions_agency ON agency_transitions(agency_id, starts_at);

-- --- Income and the commission ledger ------------------------------------------------------------------------
-- Every streamer income the commission may be based on, once per source (a gift, a campaign payout, a bonus, a
-- refund as a negative amount). Diamonds, not coins: 5,000 diamonds = 1 USD.
CREATE TABLE income_events (
  id          bigserial PRIMARY KEY,
  streamer_id uuid NOT NULL REFERENCES users(id),
  source_type text NOT NULL CHECK (source_type IN ('gift', 'lucky_gift', 'campaign', 'bonus', 'task_reward', 'refund', 'other')),
  source_ref  text NOT NULL UNIQUE CHECK (char_length(source_ref) <= 100),
  diamonds    bigint NOT NULL CHECK (diamonds <> 0),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  calc_status text NOT NULL DEFAULT 'pending' CHECK (calc_status IN ('pending', 'done', 'no_agency', 'excluded')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX income_events_pending ON income_events(id) WHERE calc_status = 'pending';
CREATE INDEX income_events_streamer ON income_events(streamer_id, occurred_at);
CREATE INDEX income_events_time ON income_events(occurred_at);

-- Closed commission periods. Rows of a closed period are final; late income goes to the open period.
CREATE TABLE agency_periods (
  period    text PRIMARY KEY CHECK (period ~ '^\d{4}-(\d{2}|W\d{2})$'),
  closed_at timestamptz NOT NULL DEFAULT now(),
  closed_by uuid REFERENCES users(id)
);

-- One row per income event that had an agency (AgencyCommissionTransactions). The UNIQUE on the event is the
-- double-commission guard: running the calculation again for the same income creates nothing.
CREATE TABLE agency_commissions (
  id                bigserial PRIMARY KEY,
  income_event_id   bigint NOT NULL UNIQUE REFERENCES income_events(id),
  txn               text NOT NULL UNIQUE,
  streamer_id       uuid NOT NULL REFERENCES users(id),
  -- The streamer's agency when the income happened, its parent (NULL for a top agency) and the top agency.
  agency_id         uuid NOT NULL REFERENCES agencies(id),
  parent_agency_id  uuid REFERENCES agencies(id),
  top_agency_id     uuid NOT NULL REFERENCES agencies(id),
  chain             uuid[] NOT NULL,
  base_diamonds     bigint NOT NULL,
  income_type       text NOT NULL,
  pool_cap          numeric(6,4) NOT NULL,
  total_rate        numeric(6,4) NOT NULL,
  agency_rate       numeric(6,4) NOT NULL,
  parent_rate       numeric(6,4) NOT NULL DEFAULT 0,
  transition_rate   numeric(6,4) NOT NULL DEFAULT 0,
  agency_amount     numeric(20,4) NOT NULL,
  parent_amount     numeric(20,4) NOT NULL DEFAULT 0,
  transition_amount numeric(20,4) NOT NULL DEFAULT 0,
  currency          text NOT NULL DEFAULT 'diamond',
  usd               numeric(20,6) NOT NULL,
  period            text NOT NULL,
  rule_version      text NOT NULL,
  occurred_at       timestamptz NOT NULL,
  calculated_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (total_rate <= pool_cap)
);
CREATE INDEX agency_commissions_chain ON agency_commissions USING gin(chain);
CREATE INDEX agency_commissions_agency ON agency_commissions(agency_id, occurred_at);
CREATE INDEX agency_commissions_streamer ON agency_commissions(streamer_id, occurred_at);

CREATE TABLE agency_payouts (
  id           bigserial PRIMARY KEY,
  agency_id    uuid NOT NULL REFERENCES agencies(id),
  ref          text NOT NULL,
  amount       numeric(20,4) NOT NULL CHECK (amount > 0),
  usd          numeric(20,2) NOT NULL,
  currency     text NOT NULL CHECK (currency IN ('USD', 'TRY')),
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'paid', 'rejected', 'cancelled')),
  requested_by uuid NOT NULL REFERENCES users(id),
  requested_at timestamptz NOT NULL DEFAULT now(),
  approved_by  uuid REFERENCES users(id),
  approved_at  timestamptz,
  paid_by      uuid REFERENCES users(id),
  paid_at      timestamptz,
  payment_ref  text UNIQUE CHECK (char_length(payment_ref) <= 100),
  note         text NOT NULL DEFAULT '',
  UNIQUE (agency_id, ref)
);
-- One payout in progress per agency: a second request cannot claim the same earnings.
CREATE UNIQUE INDEX agency_payouts_open ON agency_payouts(agency_id) WHERE status IN ('pending', 'ready');

CREATE TABLE agency_payout_history (
  id          bigserial PRIMARY KEY,
  payout_id   bigint NOT NULL REFERENCES agency_payouts(id),
  from_status text,
  to_status   text NOT NULL,
  actor_id    uuid REFERENCES users(id),
  note        text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Each agency's earnings account. kind: direct (own streamers), difference (from a sub-agency's streamers),
-- transition (former sub-agency, for a set time), transfer_fee, adjustment (manual, with a reason), reversal.
-- payout_id is the only column that may change: set when a payout claims the row, cleared if it is refused.
CREATE TABLE agency_ledger (
  id            bigserial PRIMARY KEY,
  agency_id     uuid NOT NULL REFERENCES agencies(id),
  kind          text NOT NULL CHECK (kind IN ('direct', 'difference', 'transition', 'transfer_fee', 'adjustment', 'reversal')),
  amount        numeric(20,4) NOT NULL CHECK (amount <> 0),
  rate          numeric(6,4),
  commission_id bigint REFERENCES agency_commissions(id),
  transfer_id   bigint,
  reverses      bigint UNIQUE REFERENCES agency_ledger(id),
  ref           text,
  period        text NOT NULL,
  note          text NOT NULL DEFAULT '',
  created_by    uuid REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  payout_id     bigint REFERENCES agency_payouts(id),
  UNIQUE (commission_id, agency_id, kind),
  UNIQUE (agency_id, kind, ref)
);
CREATE INDEX agency_ledger_agency ON agency_ledger(agency_id, id DESC);
CREATE INDEX agency_ledger_payout ON agency_ledger(payout_id);

-- --- Transfers, independence, parent changes -----------------------------------------------------------------
-- needs = parties that must approve (from, to, center); approvals = {party: {by, at, mode?}}.
CREATE TABLE agency_transfers (
  id             bigserial PRIMARY KEY,
  kind           text NOT NULL CHECK (kind IN ('streamer_move', 'streamer_leave', 'independence', 'change_parent', 'sub_close')),
  streamer_id    uuid REFERENCES users(id),
  agency_id      uuid REFERENCES agencies(id),
  from_agency_id uuid REFERENCES agencies(id),
  to_agency_id   uuid REFERENCES agencies(id),
  status         text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'rejected', 'cancelled')),
  needs          text[] NOT NULL,
  approvals      jsonb NOT NULL DEFAULT '{}',
  mode           text CHECK (mode IN ('free', 'paid')),
  fee            numeric(20,4) NOT NULL DEFAULT 0,
  fee_payer      text,
  fee_account    text,
  fee_rule       jsonb,
  transition     jsonb,
  reason         text NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 500),
  ref            text NOT NULL,
  requested_by   uuid NOT NULL REFERENCES users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  decided_by     uuid REFERENCES users(id),
  decided_at     timestamptz,
  decision_note  text NOT NULL DEFAULT '',
  UNIQUE (requested_by, ref)
);
CREATE UNIQUE INDEX agency_transfers_streamer_open ON agency_transfers(streamer_id) WHERE status = 'pending' AND streamer_id IS NOT NULL;
CREATE UNIQUE INDEX agency_transfers_agency_open ON agency_transfers(agency_id) WHERE status = 'pending' AND agency_id IS NOT NULL;

-- --- Staff and permissions (AgencyMembers, AgencyPermissions) ------------------------------------------------
-- Roles are data: the centre names them and picks their permissions from the catalog in agency-lib.mjs.
CREATE TABLE staff_roles (
  id          bigserial PRIMARY KEY,
  name        text NOT NULL UNIQUE CHECK (char_length(name) BETWEEN 2 AND 40),
  scope       text NOT NULL CHECK (scope IN ('platform', 'agency')),
  permissions text[] NOT NULL DEFAULT '{}',
  protected   boolean NOT NULL DEFAULT false,
  updated_by  uuid REFERENCES users(id),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

-- agency_id NULL = platform staff (BD, agency management officer…). Effective permissions = role + extra − denied.
CREATE TABLE staff_assignments (
  id          bigserial PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES users(id),
  agency_id   uuid REFERENCES agencies(id),
  role_id     bigint REFERENCES staff_roles(id),
  extra       text[] NOT NULL DEFAULT '{}',
  denied      text[] NOT NULL DEFAULT '{}',
  granted_by  uuid REFERENCES users(id),
  granted_at  timestamptz NOT NULL DEFAULT now(),
  revoked_by  uuid REFERENCES users(id),
  revoked_at  timestamptz
);
CREATE UNIQUE INDEX staff_assignments_open ON staff_assignments(user_id, coalesce(agency_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE revoked_at IS NULL;
CREATE INDEX staff_assignments_agency ON staff_assignments(agency_id) WHERE revoked_at IS NULL;

-- Which BD is responsible for which agency, over time. BD earnings are their own ledger, never taken out of
-- the agency pool.
CREATE TABLE bd_assignments (
  id          bigserial PRIMARY KEY,
  bd_id       uuid NOT NULL REFERENCES users(id),
  agency_id   uuid NOT NULL REFERENCES agencies(id),
  assigned_by uuid REFERENCES users(id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  ended_at    timestamptz
);
CREATE UNIQUE INDEX bd_assignments_open ON bd_assignments(agency_id) WHERE ended_at IS NULL;

CREATE TABLE bd_ledger (
  id            bigserial PRIMARY KEY,
  bd_id         uuid NOT NULL REFERENCES users(id),
  agency_id     uuid NOT NULL REFERENCES agencies(id),
  commission_id bigint NOT NULL REFERENCES agency_commissions(id),
  basis         numeric(20,4) NOT NULL,
  rate          numeric(6,4) NOT NULL,
  amount        numeric(20,4) NOT NULL,
  period        text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (commission_id, bd_id)
);

-- --- Performance (AgencyPerformance, AgencyPerformanceScores, AgencyPromotionHistory) -----------------------
CREATE TABLE agency_violations (
  id         bigserial PRIMARY KEY,
  agency_id  uuid NOT NULL REFERENCES agencies(id),
  points     int NOT NULL CHECK (points BETWEEN 1 AND 100),
  note       text NOT NULL CHECK (char_length(note) BETWEEN 3 AND 300),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE agency_perf_runs (
  id             bigserial PRIMARY KEY,
  as_of          timestamptz NOT NULL,
  window_from    timestamptz NOT NULL,
  effective_from timestamptz NOT NULL,
  settings       jsonb NOT NULL,
  -- Automatic runs: one per cadence period ('2026-11', '2026-Q4').
  cadence_key    text UNIQUE,
  dry_run        boolean NOT NULL DEFAULT false,
  run_by         uuid REFERENCES users(id),
  note           text NOT NULL DEFAULT '',
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE agency_perf_scores (
  run_id         bigint NOT NULL REFERENCES agency_perf_runs(id),
  agency_id      uuid NOT NULL REFERENCES agencies(id),
  parent_id      uuid REFERENCES agencies(id),
  metrics        jsonb NOT NULL,
  normalized     jsonb NOT NULL,
  score          numeric(6,2) NOT NULL,
  rank           int NOT NULL,
  parent_score   numeric(6,2),
  overtakes      boolean NOT NULL DEFAULT false,
  qualified_tier text,
  current_tier   text,
  assigned_tier  text,
  streak         int NOT NULL DEFAULT 0,
  change         text NOT NULL DEFAULT 'same' CHECK (change IN ('up', 'down', 'same', 'held', 'waiting')),
  flags          text[] NOT NULL DEFAULT '{}',
  PRIMARY KEY (run_id, agency_id)
);
CREATE INDEX agency_perf_scores_agency ON agency_perf_scores(agency_id, run_id DESC);

CREATE TABLE agency_tier_history (
  id             bigserial PRIMARY KEY,
  agency_id      uuid NOT NULL REFERENCES agencies(id),
  from_tier      text,
  to_tier        text,
  from_rate      numeric(6,4),
  to_rate        numeric(6,4) NOT NULL,
  effective_from timestamptz NOT NULL,
  source         text NOT NULL CHECK (source IN ('engine', 'manual', 'independence', 'transfer', 'approval')),
  run_id         bigint REFERENCES agency_perf_runs(id),
  rate_id        bigint REFERENCES agency_rates(id),
  actor_id       uuid REFERENCES users(id),
  reason         text NOT NULL DEFAULT '',
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agency_tier_history_agency ON agency_tier_history(agency_id, id DESC);

CREATE TABLE agency_appeals (
  id            bigserial PRIMARY KEY,
  agency_id     uuid NOT NULL REFERENCES agencies(id),
  subject       text NOT NULL CHECK (subject IN ('tier', 'commission', 'transfer', 'other')),
  body          text NOT NULL CHECK (char_length(body) BETWEEN 5 AND 1000),
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'rejected')),
  created_by    uuid NOT NULL REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  decided_by    uuid REFERENCES users(id),
  decided_at    timestamptz,
  decision_note text NOT NULL DEFAULT ''
);

-- Notices shown in the agency panels (tier changes, decisions, transfers).
CREATE TABLE agency_notices (
  id         bigserial PRIMARY KEY,
  agency_id  uuid NOT NULL REFERENCES agencies(id),
  kind       text NOT NULL,
  title      text NOT NULL,
  body       text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agency_notices_agency ON agency_notices(agency_id, id DESC);

-- --- Audit (AgencyAuditLogs): every change and every refused attempt -----------------------------------------
CREATE TABLE agency_audit (
  id          bigserial PRIMARY KEY,
  actor_id    uuid REFERENCES users(id),
  action      text NOT NULL,
  target_type text NOT NULL,
  target_id   text NOT NULL DEFAULT '',
  before      jsonb,
  after       jsonb,
  result      text NOT NULL DEFAULT 'ok' CHECK (result IN ('ok', 'denied')),
  reason      text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agency_audit_target ON agency_audit(target_type, target_id, id DESC);
CREATE INDEX agency_audit_time ON agency_audit(id DESC);

-- --- Online time, for the agency panels (from LiveKit's join / leave webhooks) -------------------------------
CREATE TABLE presence_log (
  id        bigserial PRIMARY KEY,
  user_id   uuid NOT NULL REFERENCES users(id),
  room      text NOT NULL,
  joined_at timestamptz NOT NULL,
  left_at   timestamptz NOT NULL,
  seconds   int NOT NULL CHECK (seconds >= 0)
);
CREATE INDEX presence_log_user ON presence_log(user_id, left_at);

-- --- Append-only guards ------------------------------------------------------------------------------------
CREATE FUNCTION agency_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'financial and history rows are never deleted (%)', TG_TABLE_NAME USING ERRCODE = 'P0001';
END $$;

CREATE FUNCTION agency_no_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'rows of % are never changed', TG_TABLE_NAME USING ERRCODE = 'P0001';
END $$;

-- Ledger rows: only payout_id may change (a payout claims or releases them).
CREATE FUNCTION agency_ledger_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.agency_id, NEW.kind, NEW.amount, NEW.rate, NEW.commission_id, NEW.transfer_id, NEW.reverses, NEW.period, NEW.created_at)
     IS DISTINCT FROM (OLD.agency_id, OLD.kind, OLD.amount, OLD.rate, OLD.commission_id, OLD.transfer_id, OLD.reverses, OLD.period, OLD.created_at) THEN
    RAISE EXCEPTION 'agency_ledger amounts are never changed; write a reversal or an adjustment' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

-- Income events: only the calculation status moves on.
CREATE FUNCTION income_events_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.streamer_id, NEW.source_type, NEW.source_ref, NEW.diamonds, NEW.occurred_at)
     IS DISTINCT FROM (OLD.streamer_id, OLD.source_type, OLD.source_ref, OLD.diamonds, OLD.occurred_at) THEN
    RAISE EXCEPTION 'income events are never changed; record a refund' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

-- Payouts: the amount and who asked are fixed once written.
CREATE FUNCTION agency_payouts_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.agency_id, NEW.amount, NEW.usd, NEW.currency, NEW.requested_by, NEW.ref)
     IS DISTINCT FROM (OLD.agency_id, OLD.amount, OLD.usd, OLD.currency, OLD.requested_by, OLD.ref) THEN
    RAISE EXCEPTION 'payout amounts are never changed' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER agency_commissions_no_update BEFORE UPDATE ON agency_commissions FOR EACH ROW EXECUTE FUNCTION agency_no_update();
CREATE TRIGGER agency_rates_no_update BEFORE UPDATE ON agency_rates FOR EACH ROW EXECUTE FUNCTION agency_no_update();
CREATE TRIGGER agency_settings_no_update BEFORE UPDATE ON agency_settings FOR EACH ROW EXECUTE FUNCTION agency_no_update();
CREATE TRIGGER agency_audit_no_update BEFORE UPDATE ON agency_audit FOR EACH ROW EXECUTE FUNCTION agency_no_update();
CREATE TRIGGER bd_ledger_no_update BEFORE UPDATE ON bd_ledger FOR EACH ROW EXECUTE FUNCTION agency_no_update();
CREATE TRIGGER agency_tier_history_no_update BEFORE UPDATE ON agency_tier_history FOR EACH ROW EXECUTE FUNCTION agency_no_update();
CREATE TRIGGER agency_ledger_guard BEFORE UPDATE ON agency_ledger FOR EACH ROW EXECUTE FUNCTION agency_ledger_guard();
CREATE TRIGGER income_events_guard BEFORE UPDATE ON income_events FOR EACH ROW EXECUTE FUNCTION income_events_guard();
CREATE TRIGGER agency_payouts_guard BEFORE UPDATE ON agency_payouts FOR EACH ROW EXECUTE FUNCTION agency_payouts_guard();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['agencies', 'agency_status_history', 'agency_parents', 'agency_streamers', 'agency_rates', 'agency_transitions',
    'income_events', 'agency_commissions', 'agency_ledger', 'agency_payouts', 'agency_payout_history', 'agency_transfers', 'bd_ledger',
    'agency_settings', 'agency_perf_runs', 'agency_perf_scores', 'agency_tier_history', 'agency_audit', 'agency_periods'] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION agency_no_delete()', t || '_no_delete', t);
  END LOOP;
END $$;

-- Starting roles (the centre edits them; names and permissions are data). Agency owners hold every agency
-- permission on their own agency without a role.
INSERT INTO staff_roles (name, scope, permissions, protected) VALUES
  ('Süper yönetici', 'platform', ARRAY['agencies.view', 'agencies.manage', 'agencies.rates', 'agencies.settings', 'agencies.performance', 'agencies.transfers',
     'agencies.payouts.approve', 'agencies.payouts.pay', 'agencies.ledger', 'agencies.audit', 'agencies.roles', 'agencies.appeals'], true),
  ('Ajans yönetim sorumlusu', 'platform', ARRAY['agencies.view', 'agencies.manage', 'agencies.performance', 'agencies.transfers', 'agencies.appeals', 'agencies.audit'], false),
  ('Finans sorumlusu', 'platform', ARRAY['agencies.view', 'agencies.payouts.approve', 'agencies.payouts.pay', 'agencies.ledger', 'agencies.audit'], false),
  ('BD yöneticisi', 'platform', ARRAY['bd.assigned', 'bd.acquire', 'bd.reports'], false),
  ('Üst ajans yöneticisi', 'agency', ARRAY['streamers.view', 'streamers.invite', 'streamers.approve', 'subagencies.view', 'subagencies.manage', 'subagencies.earnings',
     'reports.performance', 'reports.commission', 'transfers.manage'], false),
  ('Alt ajans yöneticisi', 'agency', ARRAY['streamers.view', 'streamers.invite', 'streamers.approve', 'reports.performance', 'reports.commission', 'transfers.manage'], false),
  ('Finans asistanı', 'agency', ARRAY['reports.commission', 'reports.export', 'payouts.request'], false),
  ('Yayıncı asistanı', 'agency', ARRAY['streamers.view', 'streamers.invite', 'reports.performance'], false);
