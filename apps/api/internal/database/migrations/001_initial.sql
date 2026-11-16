CREATE TABLE users (
 id uuid PRIMARY KEY, email text NOT NULL UNIQUE, password_hash text NOT NULL,
 username text NOT NULL UNIQUE, name text NOT NULL, email_verified boolean NOT NULL DEFAULT false, bio text NOT NULL DEFAULT '', avatar text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sessions (token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at timestamptz NOT NULL);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE posts (
 id uuid PRIMARY KEY, author_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 draft jsonb NOT NULL, revision integer NOT NULL DEFAULT 1, published jsonb, published_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX posts_published_slug ON posts(author_id, (published->>'slug')) WHERE published IS NOT NULL;
CREATE INDEX posts_author ON posts(author_id, updated_at DESC);
CREATE INDEX posts_public ON posts(published_at DESC) WHERE published IS NOT NULL;
CREATE TABLE revisions (id bigserial PRIMARY KEY, post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE, snapshot jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE likes (post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, PRIMARY KEY(post_id,user_id));
CREATE TABLE bookmarks (post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, PRIMARY KEY(post_id,user_id));
CREATE TABLE comments (id uuid PRIMARY KEY, post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,body text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX comments_post ON comments(post_id,created_at);
CREATE TABLE subscriptions (id uuid PRIMARY KEY, author_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,email text NOT NULL, confirmed boolean NOT NULL DEFAULT false,active boolean NOT NULL DEFAULT false,confirm_hash text NOT NULL,unsubscribe_hash text NOT NULL UNIQUE,unsubscribe_token text NOT NULL, confirm_expires timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(author_id,email));
CREATE INDEX subscriptions_confirm ON subscriptions(confirm_hash);
CREATE TABLE jobs (
 id uuid PRIMARY KEY, kind text NOT NULL, user_id uuid REFERENCES users(id) ON DELETE CASCADE,
 payload jsonb NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','completed','failed')),
 attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(),lease_until timestamptz,lease_token uuid,
 first_attempt_at timestamptz, result text,error text, idempotency_key text NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX jobs_claim ON jobs(status,available_at,lease_until);
CREATE INDEX jobs_user ON jobs(user_id,created_at);

CREATE TABLE account_tokens(token_hash text PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,kind text NOT NULL CHECK(kind IN ('verification','password')),expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX account_tokens_user ON account_tokens(user_id,kind,created_at);

CREATE TABLE media_assets(key text PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,bytes bigint NOT NULL CHECK(bytes>0),url text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX media_assets_user ON media_assets(user_id,created_at);
