ALTER TABLE posts ADD COLUMN draft_summary jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE posts ADD COLUMN published_summary jsonb;
-- The migration runner backfills these derived values with the same domain function used by saves and publication.
