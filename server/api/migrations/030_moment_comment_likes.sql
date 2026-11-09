-- Anlar: likes on comments (moments.mjs POST /api/moments/comment/like), one per person and comment.
CREATE TABLE IF NOT EXISTS moment_comment_likes (
  comment bigint NOT NULL REFERENCES moment_comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment, user_id)
);
CREATE INDEX IF NOT EXISTS moment_comment_likes_by_user ON moment_comment_likes (user_id);
