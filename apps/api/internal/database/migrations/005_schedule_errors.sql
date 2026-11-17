-- A scheduled publish that keeps failing counts its attempts so it cannot block later posts; a schedule the worker
-- gives up on keeps the reason for the author until they schedule or publish again.
ALTER TABLE posts ADD COLUMN schedule_attempts integer NOT NULL DEFAULT 0, ADD COLUMN schedule_error text;
