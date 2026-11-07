-- Anlar on the server (moments.mjs): short posts with an optional photo, their likes and comments.
-- A post or comment removed by its writer or by staff keeps its row (deleted_at, removed_by) so a report about it
-- can still be read; deleting the account removes the rows themselves (social.mjs eraseAccount).
CREATE TABLE IF NOT EXISTS moments (
  id bigserial PRIMARY KEY,
  author uuid NOT NULL REFERENCES users(id),
  body text NOT NULL DEFAULT '' CHECK (length(body) <= 1000),
  image_url text CHECK (length(image_url) <= 500),
  topic text CHECK (length(topic) <= 20),
  -- The app's request id: a post sent twice (a retry on a weak connection) is stored once.
  ref text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  removed_by uuid REFERENCES users(id),
  UNIQUE (author, ref)
);
CREATE INDEX IF NOT EXISTS moments_feed ON moments (id DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS moments_by_author ON moments (author, id DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS moment_likes (
  moment bigint NOT NULL REFERENCES moments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (moment, user_id)
);
CREATE INDEX IF NOT EXISTS moment_likes_by_user ON moment_likes (user_id);

CREATE TABLE IF NOT EXISTS moment_comments (
  id bigserial PRIMARY KEY,
  moment bigint NOT NULL REFERENCES moments(id) ON DELETE CASCADE,
  author uuid NOT NULL REFERENCES users(id),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 300),
  ref text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  removed_by uuid REFERENCES users(id),
  UNIQUE (author, ref)
);
CREATE INDEX IF NOT EXISTS moment_comments_of ON moment_comments (moment, id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS moment_comments_by_author ON moment_comments (author);

-- A comment can be reported too ('comment', its id), like a post ('moment').
ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_target_type_check;
ALTER TABLE reports ADD CONSTRAINT reports_target_type_check CHECK (target_type IN ('user', 'room', 'message', 'moment', 'comment'));
