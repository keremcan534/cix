-- Ajans asistanı (güncelleme 4, item 17; agency-assistants.mjs, docs/AJANS_ASISTANI.md). An agency owner names an
-- assistant among the agency's own people; the streamers the assistant brought give the assistant a share, in
-- percent, of the agency's own commission on their income. The share moves out of the owner's commission (an
-- 'assistant' row on the agency's ledger) into the assistant's wallet as diamonds, in the transaction that books
-- the commission. A refund takes it back the same way.

-- Who brought a streamer in: the person who sent the invite the streamer accepted, or the assistant whose code
-- the streamer used. Recorded from now on; older invites are filled in from the invite they accepted below.
ALTER TABLE agency_streamers ADD COLUMN invited_by uuid REFERENCES users(id);
CREATE INDEX agency_streamers_invited_by ON agency_streamers(invited_by, agency_id) WHERE invited_by IS NOT NULL;
-- A join application made with an assistant's code keeps the assistant until the agency decides.
ALTER TABLE agency_requests ADD COLUMN invited_by uuid REFERENCES users(id);

-- An accepted invite and its membership are written in one transaction (agency.mjs requests/respond), so the
-- invite's decision time is the membership's start.
UPDATE agency_streamers m SET invited_by = (
  SELECT r.created_by FROM agency_requests r
   WHERE r.agency_id = m.agency_id AND r.user_id = m.streamer_id AND r.kind = 'invite' AND r.status = 'approved'
     AND r.created_by IS NOT NULL AND r.created_by <> m.streamer_id
     AND r.decided_at BETWEEN m.joined_at - interval '1 minute' AND m.joined_at + interval '1 minute'
   ORDER BY r.decided_at DESC LIMIT 1)
 WHERE m.method = 'invite' AND m.invited_by IS NULL;

-- One row per assignment. ended_at closes it (the owner removed them, they left the agency, the account was
-- deleted); the row stays as the record. One open assignment per person, anywhere.
CREATE TABLE agency_assistants (
  id          bigserial PRIMARY KEY,
  agency_id   uuid NOT NULL REFERENCES agencies(id),
  user_id     uuid NOT NULL REFERENCES users(id),
  -- The assistant's own invite code: a streamer who joins with it is recorded as brought by the assistant.
  code        text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9]{6,10}$'),
  assigned_by uuid REFERENCES users(id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  ended_at    timestamptz,
  ended_by    uuid REFERENCES users(id),
  end_reason  text CHECK (end_reason IN ('owner', 'left', 'deleted', 'center')),
  CHECK (ended_at IS NULL OR ended_at >= assigned_at)
);
CREATE UNIQUE INDEX agency_assistants_open_user ON agency_assistants(user_id) WHERE ended_at IS NULL;
CREATE INDEX agency_assistants_agency ON agency_assistants(agency_id, assigned_at);

-- The assistant's share over time, in whole percent of the agency's own commission from the streamers they
-- brought. The share in force at a moment is the latest row with effective_from <= that moment. The first row
-- starts with the assignment; a change starts the next Monday 00:00 (Türkiye) and comes at most once a week.
CREATE TABLE agency_assistant_shares (
  id             bigserial PRIMARY KEY,
  assistant_id   bigint NOT NULL REFERENCES agency_assistants(id),
  streamer_pct   smallint NOT NULL CHECK (streamer_pct BETWEEN 0 AND 100),
  effective_from timestamptz NOT NULL,
  initial        boolean NOT NULL DEFAULT false,
  set_by         uuid REFERENCES users(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agency_assistant_shares_at ON agency_assistant_shares(assistant_id, effective_from DESC, id DESC);

-- The assistant's account: one row per commission split (UNIQUE commission_id) and one per reversal of a split.
-- amount is exact (1/10,000 diamond); `wallet` is the whole diamonds that moved into (+) or out of (−) the
-- assistant's wallet with this row. Fractions wait until they add up to a whole diamond: what reached the wallet
-- is never more than the exact total, except while a refund the wallet could not pay is still owed (later
-- shares settle it first).
CREATE TABLE agency_assistant_ledger (
  id               bigserial PRIMARY KEY,
  assistant_id     bigint NOT NULL REFERENCES agency_assistants(id),
  user_id          uuid NOT NULL REFERENCES users(id),
  agency_id        uuid NOT NULL REFERENCES agencies(id),
  commission_id    bigint UNIQUE REFERENCES agency_commissions(id),
  -- The owner's side of the same move (the 'assistant' row of agency_ledger, or its reversal).
  agency_ledger_id bigint REFERENCES agency_ledger(id),
  reverses         bigint UNIQUE REFERENCES agency_assistant_ledger(id),
  streamer_id      uuid REFERENCES users(id),
  -- The agency's own commission the share was taken from, and the share in percent.
  basis            numeric(20,4) NOT NULL,
  pct              smallint NOT NULL CHECK (pct BETWEEN 0 AND 100),
  amount           numeric(20,4) NOT NULL CHECK (amount <> 0),
  wallet           bigint NOT NULL DEFAULT 0,
  period           text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agency_assistant_ledger_user ON agency_assistant_ledger(user_id, id);
CREATE INDEX agency_assistant_ledger_assistant ON agency_assistant_ledger(assistant_id, created_at);

-- The commission record keeps how much of the streamer's agency's share went to an assistant.
ALTER TABLE agency_commissions ADD COLUMN assistant_amount numeric(20,4) NOT NULL DEFAULT 0;

-- The owner's side: an 'assistant' row (negative) next to the agency's own commission row.
ALTER TABLE agency_ledger DROP CONSTRAINT agency_ledger_kind_check;
ALTER TABLE agency_ledger ADD CONSTRAINT agency_ledger_kind_check CHECK (kind IN ('direct', 'difference', 'transition', 'transfer_fee', 'adjustment', 'reversal', 'assistant'));

-- History and money rows are never deleted; shares and the assistant's account are never changed.
CREATE TRIGGER agency_assistants_no_delete BEFORE DELETE ON agency_assistants FOR EACH ROW EXECUTE FUNCTION agency_no_delete();
CREATE TRIGGER agency_assistant_shares_no_delete BEFORE DELETE ON agency_assistant_shares FOR EACH ROW EXECUTE FUNCTION agency_no_delete();
CREATE TRIGGER agency_assistant_shares_no_update BEFORE UPDATE ON agency_assistant_shares FOR EACH ROW EXECUTE FUNCTION agency_no_update();
CREATE TRIGGER agency_assistant_ledger_no_delete BEFORE DELETE ON agency_assistant_ledger FOR EACH ROW EXECUTE FUNCTION agency_no_delete();
CREATE TRIGGER agency_assistant_ledger_no_update BEFORE UPDATE ON agency_assistant_ledger FOR EACH ROW EXECUTE FUNCTION agency_no_update();
