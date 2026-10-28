-- Users and wallet. Balances live on the user row and change only inside a transaction that also writes the
-- ledger, so the ledger always explains the balance. CHECKs make an overdraft impossible even if code is wrong.

CREATE TABLE users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 40),
  -- Development sign-in: sha256 of a random key kept on the device. SMS / Google / Apple come later as more columns.
  device_key_hash text UNIQUE,
  coins           bigint NOT NULL DEFAULT 0 CHECK (coins >= 0),
  diamonds        bigint NOT NULL DEFAULT 0 CHECK (diamonds >= 0),
  -- Casino winnings: playable only, never gifted or withdrawn (docs/OYUN_MERKEZI.md).
  game_coins      bigint NOT NULL DEFAULT 0 CHECK (game_coins >= 0),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE ledger (
  id           bigserial PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  currency     text NOT NULL CHECK (currency IN ('coin', 'diamond', 'game')),
  amount       bigint NOT NULL CHECK (amount <> 0),
  -- Balance right after this row, for support and audits.
  balance      bigint NOT NULL CHECK (balance >= 0),
  reason       text NOT NULL,
  -- Client request id: the same request sent twice (retry, double tap) is applied once.
  ref          text NOT NULL,
  counterparty uuid REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, currency, ref)
);
CREATE INDEX ledger_user_time ON ledger(user_id, id DESC);
