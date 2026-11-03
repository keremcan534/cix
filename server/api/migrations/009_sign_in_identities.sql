-- Sign in with Google (auth.mjs POST /api/auth/google): one row per Google account, by its stable id (`sub`),
-- pointing to our user. A user has at most one Google account. The e-mail is kept for support only. Account
-- deletion removes the row, so the same Google account can open a new account later.
CREATE TABLE auth_identities (
  provider     text NOT NULL CHECK (provider IN ('google')),
  subject      text NOT NULL CHECK (char_length(subject) BETWEEN 1 AND 255),
  user_id      uuid NOT NULL REFERENCES users(id),
  email        text CHECK (char_length(email) <= 320),
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, subject),
  UNIQUE (provider, user_id)
);
