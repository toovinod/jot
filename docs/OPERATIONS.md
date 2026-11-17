# Self-hosting and operations

## Environment

Copy `.env.example` and fill values for the target environment. Root Bun commands load this file and Turbo explicitly passes supported values to workspaces. Running `go run` directly does not load `.env`; export the values first. Relative upload paths resolve from the Go process's working directory. Containers use `/data/uploads`.

Use the pooled Neon `DATABASE_URL` with TLS for the API and worker. Migrations prefer the direct `DATABASE_URL_UNPOOLED` when set. For Compose, set the separate `COMPOSE_DATABASE_URL` and `COMPOSE_DATABASE_URL_UNPOOLED` overrides to the intended hosted URLs. This keeps a copied localhost development URL from directing a container to the wrong host. Run `bun run db:migrate` once during a controlled release before starting new app processes. Back up the database and local media before migration. Maintain provider snapshots/PITR and test restore into a separate environment. Restore from backups to roll back data when necessary.

`APP_ORIGIN` must be the exact public origin, including scheme and port. HTTPS makes API cookies Secure. Set `API_ADDR` for the Go listener, and keep it private behind the web proxy. `API_INTERNAL_URL` is captured in Next rewrites at build time: rebuild the web image when changing it. No API/database/provider credential belongs in a public environment variable.

## Containers

```sh
cp .env.example .env
# Replace POSTGRES_PASSWORD and set the intended public APP_ORIGIN.
docker compose --profile app up --build -d
docker compose --profile app logs -f
```

The default Compose invocation starts only Postgres, bound to `127.0.0.1:5433`. The `app` profile builds Bun web and Go API/worker images, applies migrations, then starts the services. Caddy is the only published app ingress, bound to loopback on port 3000 in the base configuration. Web and API ports stay private. The API health check verifies database readiness; the web health check exercises its API proxy. The worker deliberately has no fake HTTP health endpoint: supervise its process and alert on old pending/running jobs and failed jobs.

On a fresh volume, `scripts/database/init-postgres.sh` creates the `jot` database and its owner login without superuser privileges. `POSTGRES_ADMIN_PASSWORD` belongs only to the bootstrap `postgres` account; app services receive only the separate `POSTGRES_PASSWORD` through `PGPASSWORD`. The internal database URL omits its password so reserved URL characters in the password remain literal. A password explicitly supplied in `COMPOSE_DATABASE_URL` takes precedence. Replace both sample passwords before shared hosting. Existing initialized volumes are not reconfigured by this script; migrate roles/passwords manually after taking a backup.

Named `postgres18` and `uploads` volumes preserve state across restarts. `docker compose down` retains these volumes. PostgreSQL 18 uses a new volume mounted at `/var/lib/postgresql`. If an existing local installation uses PostgreSQL 17, export its Jot database with PostgreSQL 17 and restore it into the new volume before switching the app over. The old `postgres` volume retains its original data. For hosted Neon, replace the backend `DATABASE_URL` mapping and remove the local database dependency in a deployment-specific Compose override.

For public TLS hosting with Docker Compose 2.24.4 or newer, point a public DNS hostname at the host, allow ports 80/443, and set `SITE_ADDRESS` to that hostname without a scheme/path. The production override requires this value, enables Caddy automatic HTTPS, publishes 80/443, and sets the API/worker/migration origin to `https://SITE_ADDRESS` with `APP_ENV=production`:

```sh
SITE_ADDRESS=writing.example.com docker compose -f compose.yaml -f compose.production.yaml \
  --profile app up --build -d
```

The production override removes the database's host port. PostgreSQL startup rejects the example application/bootstrap passwords even when `.env.example` was copied unchanged; set separate nondefault `POSTGRES_PASSWORD` and `POSTGRES_ADMIN_PASSWORD` values before starting. Passwords are passed as literal environment values rather than interpolated into a connection URL. Existing volumes still require a deliberate SQL password change as described above.

Persist Caddy's `caddy_data` volume for certificate state. Check certificates and Secure cookies after deployment. The production override fails configuration when `SITE_ADDRESS` is missing. Without the override, the loopback HTTP profile is for local verification.

### Forwarded client addresses

The supported public path is Caddy -> private Next web -> private Go API. Caddy replaces `X-Forwarded-For` with the immediate client's socket address and removes alternative forwarded identity headers. Next preserves that sanitized value. Compose gives Next a fixed private IPv4 address and configures Go to trust exactly that address's `/32`, never the entire subnet. This follows Caddy's documented [upstream header controls](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy#headers) and [remote address placeholder](https://caddyserver.com/docs/caddyfile/concepts#placeholders).

`TRUSTED_PROXY_CIDRS` is empty by default outside Compose. Do not set it to loopback while directly exposing Next: Next can preserve a client-supplied forwarded header. Local `bun run dev` therefore uses conservative shared proxy limits. Do not expose Next or Go around the sanitizing ingress. The Compose network is a trusted service boundary; restrict Docker access and never attach untrusted containers.

If the default `172.31.97.0/24` conflicts with your network, change `JOT_SUBNET` and `JOT_WEB_IP` together, using an unused IPv4 address inside that subnet. API trust follows only that configured web IP. Additional CDNs/load balancers are not part of this supported ingress contract: Caddy currently uses its immediate peer's address. Configure and verify a constrained trust chain separately before introducing another proxy.

### Custom domains

Custom domains are off until `CUSTOM_DOMAIN_TARGET` is set on the API (and worker, which shares the backend environment). Set it to the hostname authors point their domain at with a CNAME, usually the same host as `SITE_ADDRESS`. The Compose files pass it to the API and worker from `.env`. `/api/config` then returns it as `domainTarget` and the settings page offers custom domains.

An author adds a domain, creates the TXT record `_jot.<domain>` with the shown `jot-verify=...` value, and a CNAME from the domain to the target, then presses verify. The API looks the TXT record up with the server's resolver. Only verified domains resolve to a page (`/api/domains/resolve`) or receive a certificate.

Caddy issues certificates on demand and must ask the API first, so it never requests certificates for arbitrary names. The ask endpoint returns 200 only for verified domains, and 404 for everything while custom domains are off. `docker/Caddyfile` ships this setup: the global `on_demand_tls { ask http://api:8080/api/domains/allowed }` block and an `https://` catch-all site with `tls { on_demand }` that proxies to Next with the same header rules as the main site.

Caddy appends `?domain=<name>` to the ask URL. The API is reachable as `api:8080` on the Compose network; it is never published. Requests for a custom host reach Next, which resolves the host through `/api/domains/resolve` and serves that author's pages. Sessions stay on `APP_ORIGIN`: readers are signed out on custom domains. The API accepts `Origin: https://<verified domain>` (exact host) only for the view counter and the subscribe form, and only for that domain owner's posts and page; likes, comments and every other write still require `APP_ORIGIN`.

### Scheduled publishing, views and account deletion

The worker publishes due scheduled posts once a minute, so scheduling requires a running worker. Each due post is published in its own transaction with the same code as the publish button. A publish refused at that moment (an invalid draft, an unverified email or the newsletter budget) clears the schedule, is logged as `Scheduled publication refused` and shows the author the reason; the post stays a draft. Other failures are logged as `Scheduled publication failed`, skipped for the rest of that pass so later posts still publish, and retried each minute; after 5 failed passes the schedule is cleared with a reason for the author.

Page views are counted once per viewer per post per day. Anonymous viewers are keyed by client address only (IPv6 collapsed to its /64) as an HMAC-SHA256 with a secret mixed with the UTC day, so stored keys rotate daily and cannot be reversed by hashing guessed addresses; raw addresses are not stored. Set `VIEW_HASH_SECRET` (at least 32 characters, for example `openssl rand -hex 32`) to the same value on every API replica so restarts and replicas do not count a reader again on the same day; keep it private like any other secret. When it is empty each API process uses its own random secret, so a reader can be counted again after an API restart or by another replica. Maintenance deletes view-dedupe rows older than two days in batches of 1000, repeating until a batch comes back short or a 5 second budget runs out. Accurate client addresses depend on the forwarded-address setup above.

Deleting an account removes its database rows in one transaction, then deletes its uploaded files from local disk or S3 (batched `DeleteObjects`, 1000 keys per request) best effort within 50 seconds. The transaction locks the user row first, as uploads do, so a concurrent upload cannot add a media row that deletion misses. Every key that could not be removed, including keys left when the budget ran out, is logged as `Media cleanup failed`; remove those objects manually. Provider requests already sent cannot be recalled.

Roll out API and worker from the same source revision. Check health, read/write flows and queue processing after each rollout; roll back the image only if the schema remains compatible.

Migrations 4, 5 and 6 only add columns, tables and indexes (6 adds `comment_blocks`, the authors' block lists). Apply them before starting the new API and worker; the new worker publishes scheduled posts and renders newsletters from the recorded edition, and newsletters queued by an older version still send their summary and link.

For upgrades from schema 1, stop the old API and worker before applying migrations, then start the new versions together. The summary backfill and URL reservations must not be followed by writes from an old application version. Migration 2 preserves a currently published slug, or the latest historical slug of an unpublished post. Conflicting legacy claims stop the whole migration transaction with a repair hint; back up and resolve the named posts deliberately rather than changing their URLs automatically. Rehearse this upgrade against a restored database first.

## Demo fixtures

All demo data lives in `scripts/fixtures`; `scripts/seed.ts` uses normal signup/login, draft save, publish, like and comment APIs. It creates the sample author Harper (`harper@example.com`, `/@harper`) with four published technical posts, and a reader, Quinn (`quinn@example.com`), who likes and comments on them; both accounts use `SEED_PASSWORD`. Start the API against the intended development database and run `SEED_PASSWORD=your-demo-password bun run seed`. `SEED_BASE_URL` defaults to `http://127.0.0.1:8080`; it can instead point to the running web/Caddy origin. `APP_ORIGIN` must match the API's configured origin. The script refuses any `SEED_BASE_URL` that is not `localhost`, `127.0.0.1` or `[::1]` unless `SEED_ALLOW_REMOTE=1` is set for a disposable stack.

The password must be explicit and 10-72 bytes. Existing account passwords/details are never changed; a wrong password or username mismatch fails. Existing fixture slugs, including drafts, are skipped, and reader likes and comments are added only to posts created in that run, so running it again adds nothing. `SEED_EMAIL` and `SEED_USERNAME` override the author identity. The script does not email subscribers. `db:seed` is an alias for this HTTP command, and no demo data or seed business logic lives under `apps/api`.

## Storage and providers

Local storage is the default. Persist and back up `UPLOAD_DIR`, and serve it only through the validated media route. Images have public URLs and are not protected by draft ownership. Docker context rules exclude private environment files at every workspace depth; CI probes nested web/API environment fixtures before image builds. In production, configure `S3_BUCKET`, `S3_REGION`, optional `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` and `S3_PUBLIC_URL`. Restrict credentials to the required bucket operations. Set correct bucket/CDN public access and CORS policy, verify image upload/read/delete behavior, and establish a retention policy. The app does not claim garbage collection of orphaned images.

For Resend, configure a verified sending domain and `EMAIL_FROM`. Subscription confirmation requires user action; avoid sending publication emails to unconfirmed addresses. Test confirmation expiry, unsubscribe, one-click unsubscribe, retry failures and cancellation. Provider idempotency is bounded by the provider's window; exactly-once delivery is not guaranteed. The worker persists the first serialized Resend request under the current lease, without storing an API key, and reuses that exact request across configuration/template changes. Each attempt still checks the current subscription generation, publication and lease. Stored requests contain recipient addresses and link tokens and follow the existing 30-day terminal email-job retention; run the worker for maintenance and include this retention in your privacy policy. Each newsletter job stores its own request, bounded at 4 MiB, which fits the full HTML and text of any post at the 500,000-byte text limit; a typical long post is about 1 MB. The rendered post is stored once per subscriber, so one publish can store up to 500 copies (2000 per author per day) until retention removes them: size the database for that, or watch `jobs` growth. A post whose links or markup still exceed the bound sends the subtitle and link instead; the worker logs `Newsletter too large for one email` and the job carries `contentOmitted` in its payload and `result`. Newsletters are sent from `"<author name> via <instance>"` on the `EMAIL_FROM` address, where the instance is `EMAIL_FROM`'s display name (or `jot`). Retryable provider responses honor `Retry-After` within the job deadline. Resend concurrent-idempotency conflicts remain retryable, while a different-payload conflict is terminal. An unsubscribe/unpublish that arrives after a provider request is already in flight cannot recall that message. Delivery/bounce/complaint reconciliation and automated suppression must be completed before broad sending.

OpenAI is optional. Set `OPENAI_API_KEY` and `OPENAI_MODEL`. Requested text leaves your server for that provider; disclose this in your privacy policy. AI review identifies possible gaps and does not verify facts. Observe quotas, cost and job failures. Incomplete/truncated and refused responses fail with a safe explanation rather than appearing as completed suggestions or consuming repeated identical retries. Keep all network calls out of publishing transactions.

## Verification

CI installs the frozen Bun lockfile, runs migrations against isolated Postgres, checks types/Go vet, runs unit/database tests and Go race tests, builds all workspaces, then starts the production web, API and worker for `scripts/integration/http-smoke.ts`, with `JOT_SMOKE_DATABASE_URL` set to its disposable database. A separate CI job validates Caddy/Compose, builds both container images, starts the full stack, and runs the HTTP smoke through Caddy. Actual run results are reported separately; a workflow file is not proof it passed.

For local HTTP tests, start the API, the worker and the web app against a disposable database, then run `bun run test:integration` with `JOT_SMOKE_URL` (and `APP_ORIGIN`, if it differs) set to the web origin. Root Bun commands load `.env`, so set both explicitly or run `bun --no-env-file run scripts/integration/http-smoke.ts`. The smoke creates randomized accounts and goes through every feature over HTTP: sessions and origin rules, uploads, editor saves and revision conflicts, publishing, editions and restore, tags, search, tag filter and popular sort, likes, bookmarks, comments, replies, comments off, blocking and unblocking readers, views, scheduling (it waits about three minutes for the worker to publish a post), private share links, documents at the size limits, subscriptions, custom domains (set `CUSTOM_DOMAIN_TARGET` on the API to cover more than the disabled path), RSS, the sitemap, the export zip and account deletion. It ends by deleting its author account. With `JOT_SMOKE_DATABASE_URL` pointing at the same disposable database it also plants the tokens email would deliver (verification and subscription confirmation) and marks the custom domain verified to check resolution and custom-host pages; without it those checks cover only what the API answers without email or DNS. Signup allows 10 accounts per client address per hour and the smoke creates 3, so restart the API between frequent runs. Never point it at a production database.

## Release gates

This repository is an initial self-hostable implementation, not a verified public production deployment. Before public exposure, assign owners and validate:

- Account email verification and password reset/recovery end-to-end flows with real email, plus session revocation and account deletion against real storage.
- Abuse reporting, site-wide moderation beyond each author's block list, anti-spam and a private vulnerability reporting channel.
- Resend domain verification, real delivery, bounce/complaint webhooks, suppression and retry-window behavior.
- Real OpenAI requests, quotas/cost controls and privacy disclosures if AI is enabled.
- Hosted S3/Neon configuration, least-privilege credentials, TLS, backup/restore and upgrade rehearsal.
- Shared/perimeter rate limits for multiple instances; current in-process limits are not distributed. Each limit purpose (client address, login, signup, and so on) keeps at most 10,000 counters per process. A full view-counter store evicts the counter closest to expiry; every other full store refuses new keys with 429 until counters expire, so flooding new keys cannot reset a login or address counter but can briefly lock out new clients of that purpose. Put perimeter limits in front for large deployments.
- Browser clipboard fidelity, upload limits, accessibility and mobile rendering with realistic documents.
- Queue backlog/dead-letter alerts, worker lease recovery, graceful shutdown and deployment rollback.
- Dependency vulnerability review and image build/runtime validation on the actual deployment platform.

Custom domains need the TLS and DNS setup above before they are offered. View counts are a per-post total, not analytics. Features deferred by the product plan include detailed analytics, following authors, video and password-protected posts. Do not advertise them as implemented. Append final verified checks and remaining gaps to `PLAN.md` during integration.

## Dependency audit notes

The 2026-11-10 audit replaced Tailwind Typography's pinned `postcss-selector-parser` 6.0.10 with the compatible 6.1.5 patch through a narrow root override. [GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf) concerns inefficient selector parsing. Jot uses this path for trusted build-time CSS rather than reader-authored selectors; its local severity is P3. The post-change Bun registry audit reported no known vulnerabilities across 222 packages.

The official Go scan reported no reachable vulnerable symbol. The module-level [GO-2026-5932](https://vuln.go.dev/ID/GO-2026-5932.json) advisory applies to `golang.org/x/crypto/openpgp`; Jot imports `bcrypt` and does not import the affected OpenPGP package. No prerelease upgrade was made to suppress that unrelated package advisory. These results describe the audited dependency set and date, not a guarantee about future vulnerabilities.
