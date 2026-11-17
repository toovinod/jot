ALTER TABLE posts ADD COLUMN scheduled_at timestamptz, ADD COLUMN schedule_email boolean NOT NULL DEFAULT false, ADD COLUMN share_token text UNIQUE, ADD COLUMN views bigint NOT NULL DEFAULT 0;
CREATE INDEX posts_scheduled ON posts(scheduled_at) WHERE scheduled_at IS NOT NULL;
CREATE INDEX posts_published_tags ON posts USING gin((published_summary->'tags')) WHERE published IS NOT NULL;
CREATE INDEX revisions_post ON revisions(post_id,id);
-- One counted read per viewer per post per day; viewer_key is a hash, never a raw address.
CREATE TABLE post_views(post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE, viewer_key text NOT NULL, day date NOT NULL, PRIMARY KEY(post_id,viewer_key,day));
CREATE INDEX post_views_day ON post_views(day);
ALTER TABLE comments ADD COLUMN parent_id uuid REFERENCES comments(id) ON DELETE CASCADE;
CREATE INDEX comments_parent ON comments(parent_id) WHERE parent_id IS NOT NULL;
-- Only verified domains are unique, so an unverified claim cannot block the real owner.
CREATE TABLE custom_domains(user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, domain text NOT NULL CHECK(domain=lower(domain)), verify_token text NOT NULL, verified_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX custom_domains_verified ON custom_domains(domain) WHERE verified_at IS NOT NULL;
CREATE INDEX custom_domains_domain ON custom_domains(domain);
