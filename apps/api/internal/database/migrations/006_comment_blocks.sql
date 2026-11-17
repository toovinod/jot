-- An author's block list: a blocked reader cannot comment on any of the author's posts, and that reader's comments
-- there (with their replies) stay hidden until the author unblocks them.
CREATE TABLE comment_blocks(author_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, blocked_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(author_id,blocked_user_id), CHECK(author_id<>blocked_user_id));
CREATE INDEX comment_blocks_blocked ON comment_blocks(blocked_user_id);
