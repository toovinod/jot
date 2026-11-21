# Self-hosting and operations

## Environment

Copy [`.env.example`](../.env.example) to `.env` and set values for the target environment. Root Bun commands load `.env` and Turbo passes supported values to workspaces. Export the variables when running `go run` directly. Relative upload paths resolve from the Go process's working directory. Containers use `/data/uploads`.

The source setup reads `DATABASE_URL` for the API and worker. The migration command prefers `DATABASE_URL_UNPOOLED` when present. Compose uses its internal database URL by default. Its separate `COMPOSE_DATABASE_URL` and `COMPOSE_DATABASE_URL_UNPOOLED` overrides target a hosted database.

`APP_ORIGIN` must be the exact public origin, including scheme and port. HTTPS makes API cookies Secure. Set `API_ADDR` for the Go listener, and keep it private behind the web proxy. `API_INTERNAL_URL` is captured in Next rewrites at build time: rebuild the web image when changing it. No API/database/provider credential belongs in a public environment variable.

## Containers

### Local preview

```sh
cp .env.example .env
docker compose --profile app up --build -d --wait
```

The default Compose invocation starts only Postgres, bound to `127.0.0.1:5433`. The `app` profile builds Bun web and Go API/worker images, applies migrations, then starts the services. Caddy is the only published app ingress, bound to loopback on port 3000 in the base configuration. Web and API ports stay private. The API health check verifies database readiness; the web health check exercises its API proxy. The worker deliberately has no fake HTTP health endpoint: supervise its process and alert on old pending/running jobs and failed jobs.

On a fresh volume, `scripts/database/init-postgres.sh` creates the `jot` database and its owner login without superuser privileges. `POSTGRES_ADMIN_PASSWORD` belongs only to the bootstrap `postgres` account; app services receive only the separate `POSTGRES_PASSWORD` through `PGPASSWORD`. The internal database URL omits its password so reserved URL characters in the password remain literal. A password explicitly supplied in `COMPOSE_DATABASE_URL` takes precedence. Replace both sample passwords before shared hosting. Existing initialized volumes are not reconfigured by this script; migrate roles/passwords manually after taking a backup.

Named `postgres18` and `uploads` volumes preserve state across restarts. `docker compose --profile app down` stops the stack and retains these volumes.

### Public deployment

Use Docker Compose 2.24.4 or newer. Point your DNS hostname at the host and allow inbound TCP ports 80 and 443. In `.env`, set `SITE_ADDRESS` to the public DNS hostname without a scheme or path, and set separate non-default `POSTGRES_PASSWORD` and `POSTGRES_ADMIN_PASSWORD` values. The production override sets the app origin to `https://SITE_ADDRESS`, configures Caddy automatic HTTPS, enables production mode for the backend, and removes the published database port.

```sh
docker compose -f compose.yaml -f compose.production.yaml --profile app config --quiet
docker compose -f compose.yaml -f compose.production.yaml --profile app up --build -d --wait
```

Compose runs `migrate` before starting the API and worker. A successful migration exits with code 0. Keep Caddy's `caddy_data` volume for certificate state. After rollout, request `/api/health` through the public HTTPS origin, check Secure session cookies, and verify that the worker processes scheduled jobs and any enabled provider jobs. See [Release gates](#release-gates) before opening the site to the public.

### Hosted PostgreSQL

For the source setup, set `DATABASE_URL` to the hosted connection URL. With Neon, use the pooled URL with TLS for the API and worker and the direct URL in `DATABASE_URL_UNPOOLED` for migrations. The Neon CLI can populate both in the root `.env` after you link Jot to your project. In Compose, put those URLs in `COMPOSE_DATABASE_URL` and `COMPOSE_DATABASE_URL_UNPOOLED`. Supply the database password in the hosted URL. The shipped Compose file still starts its local database service. To omit it, use a deployment-specific override that removes the local service and the migration service's dependency on it.

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

The worker runs AI jobs in 2 lanes of their own, apart from the lane for email (verification, password reset, newsletters and subscription confirmations) and from the once-a-minute scheduled publishing and cleanup pass. A slow AI answer (each may take up to 4.5 minutes) therefore never delays sign-in or reset email or a scheduled post; at most 2 AI jobs run at once per worker process and later ones wait in the queue. On shutdown every lane stops claiming, in-flight jobs are cancelled and recorded for retry, and the process exits once all lanes have stopped.

The worker publishes due scheduled posts once a minute, so scheduling requires a running worker. Each due post is published in its own transaction with the same code as the publish button. A publish refused at that moment (an invalid draft, an unverified email or the newsletter budget) clears the schedule, is logged as `Scheduled publication refused` and shows the author the reason; the post stays a draft. Other failures are logged as `Scheduled publication failed`, skipped for the rest of that pass so later posts still publish, and retried each minute; after 5 failed passes the schedule is cleared with a reason for the author.

Page views are counted once per viewer per post per day. Anonymous viewers are keyed by client address only (IPv6 collapsed to its /64) as an HMAC-SHA256 with a secret mixed with the UTC day, so stored keys rotate daily and cannot be reversed by hashing guessed addresses; raw addresses are not stored. Set `VIEW_HASH_SECRET` (at least 32 characters, for example `openssl rand -hex 32`) to the same value on every API replica so restarts and replicas do not count a reader again on the same day; keep it private like any other secret. When it is empty each API process uses its own random secret, so a reader can be counted again after an API restart or by another replica. Maintenance deletes view-dedupe rows older than two days in batches of 1000, repeating until a batch comes back short or a 5 second budget runs out. Accurate client addresses depend on the forwarded-address setup above.

Deleting an account removes its database rows in one transaction, then deletes its uploaded files from local disk or S3 (batched `DeleteObjects`, 1000 keys per request) best effort within 50 seconds. The transaction locks the user row first, as uploads do, so a concurrent upload cannot add a media row that deletion misses. Every key that could not be removed, including keys left when the budget ran out, is logged as `Media cleanup failed`; remove those objects manually. Provider requests already sent cannot be recalled.

## Upgrades

Back up PostgreSQL and local media before migrating. Retain provider snapshots or point-in-time recovery for hosted databases, and test restores in a separate environment. Run `bun run db:migrate` before starting a source deployment, or let the `migrate` service apply migrations in Compose. Roll out the API and worker from the same source revision. Check health, read/write flows, and queue processing after each rollout. An image rollback requires a compatible schema.

PostgreSQL 18 uses the `postgres18` volume at `/var/lib/postgresql`. To upgrade an existing PostgreSQL 17 installation, export the Jot database with PostgreSQL 17 and restore it into the new volume. The old `postgres` volume retains its original data.

Migrations 4, 5 and 6 only add columns, tables and indexes (6 adds `comment_blocks`, the authors' block lists). Apply them before starting the new API and worker; the new worker publishes scheduled posts and renders newsletters from the recorded edition, and newsletters queued by an older version still send their summary and link.

For upgrades from schema 1, stop the old API and worker before applying migrations, then start the new versions together. The summary backfill and URL reservations must not be followed by writes from an old application version. Migration 2 preserves a currently published slug, or the latest historical slug of an unpublished post. Conflicting legacy claims stop the whole migration transaction with a repair hint; back up and resolve the named posts deliberately rather than changing their URLs automatically. Rehearse this upgrade against a restored database first.

## Demo fixtures

All demo data lives in `scripts/fixtures`; `scripts/seed.ts` uses normal signup/login, draft save, publish, like and comment APIs. It creates the sample author Harper (`harper@example.com`, `/@harper`) with four published technical posts, and a reader, Quinn (`quinn@example.com`), who likes and comments on them; both accounts use `SEED_PASSWORD`. Start the API against the intended development database and run `SEED_PASSWORD=your-demo-password bun run seed`. `SEED_BASE_URL` defaults to `http://127.0.0.1:8080`; it can instead point to the running web/Caddy origin. `APP_ORIGIN` must match the API's configured origin. The script refuses any `SEED_BASE_URL` that is not `localhost`, `127.0.0.1` or `[::1]` unless `SEED_ALLOW_REMOTE=1` is set for a disposable stack.

The password must be explicit and 10-72 bytes. Existing account passwords/details are never changed; a wrong password or username mismatch fails. Existing fixture slugs, including drafts, are skipped, and reader likes and comments are added only to posts created in that run, so running it again adds nothing. `SEED_EMAIL` and `SEED_USERNAME` override the author identity. The script does not email subscribers. `db:seed` is an alias for this HTTP command, and no demo data or seed business logic lives under `apps/api`.

## Storage and providers

Local disk is the default, including in Compose. Persist and back up `UPLOAD_DIR` and let Jot serve it through the media route. Images have public URLs, even when attached to a draft. With S3-compatible storage, set `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, and `S3_PUBLIC_URL`. Set `S3_REGION` and `S3_ENDPOINT` for your provider as needed. Use an HTTPS public media base URL for an HTTPS instance. Restrict credentials to the required bucket operations, verify upload/read/delete behavior, and plan for retention and manual cleanup of orphaned assets.

For Neon Object Storage, link the Neon CLI to the intended project and branch and run `neon deploy` with the repository's [`neon.ts`](../neon.ts). It declares a public-read bucket called `jot`. Set `S3_BUCKET=jot` and use the `AWS_ENDPOINT_URL_S3`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_REGION` values from Neon. Jot derives the bucket's public URL unless you set `S3_PUBLIC_URL` explicitly.

For Resend, configure a verified sending domain and `EMAIL_FROM`. Subscription confirmation requires user action; avoid sending publication emails to unconfirmed addresses. Test confirmation expiry, unsubscribe, one-click unsubscribe, retry failures and cancellation. Provider idempotency is bounded by the provider's window; exactly-once delivery is not guaranteed. The worker persists the first serialized Resend request under the current lease, without storing an API key, and reuses that exact request across configuration/template changes. Each attempt still checks the current subscription generation, publication and lease. Stored requests contain recipient addresses and link tokens and follow the existing 30-day terminal email-job retention; run the worker for maintenance and include this retention in your privacy policy. Each newsletter job stores its own request, bounded at 4 MiB, which fits the full HTML and text of any post at the 500,000-byte text limit; a typical long post is about 1 MB. The rendered post is stored once per subscriber, so one publish can store up to 500 copies (2000 per author per day) until retention removes them: size the database for that, or watch `jobs` growth. A post whose links or markup still exceed the bound sends the subtitle and link instead; the worker logs `Newsletter too large for one email` and the job carries `contentOmitted` in its payload and `result`. Newsletters are sent from `"<author name> via <instance>"` on the `EMAIL_FROM` address, where the instance is `EMAIL_FROM`'s display name (or `jot`). Retryable provider responses honor `Retry-After` within the job deadline. Resend concurrent-idempotency conflicts remain retryable, while a different-payload conflict is terminal. An unsubscribe/unpublish that arrives after a provider request is already in flight cannot recall that message. Delivery/bounce/complaint reconciliation and automated suppression must be completed before broad sending.

OpenAI is optional. Set `OPENAI_API_KEY` to enable Jot AI chat and writing suggestions. The model defaults to `gpt-6-luna` and can be changed with `OPENAI_MODEL`. Requested text and any source material attached to a chat go to OpenAI. Disclose this in your privacy policy and monitor quotas, cost, and job failures. AI review flags possible gaps for the writer to check. Incomplete and refused responses fail the job. The worker prunes completed and failed AI jobs after one day.

## Verification

CI installs the frozen Bun lockfile, runs migrations against isolated Postgres, checks types/Go vet, runs unit/database tests and Go race tests, builds all workspaces, then starts the production web, API and worker for `scripts/integration/http-smoke.ts`, with `JOT_SMOKE_DATABASE_URL` set to its disposable database. A separate CI job validates Caddy/Compose, builds both container images, starts the full stack, and runs the HTTP smoke through Caddy. Actual run results are reported separately; a workflow file is not proof it passed.

For local HTTP tests, start the API, worker, and web app against a disposable database, then run `bun run test:integration`. Set `JOT_SMOKE_URL` to the web origin and `APP_ORIGIN` to the origin expected by the API if you changed the defaults. Bun loads the root `.env`; use `bun --no-env-file run scripts/integration/http-smoke.ts` to work only with exported variables and script defaults.

The smoke creates randomized accounts and exercises sessions, uploads, revision conflicts, publishing and restore, discovery, engagement and moderation, draft links, scheduling, feeds, export, and account deletion. Allow about three minutes for the scheduled publication case. `JOT_SMOKE_DATABASE_URL` lets the smoke seed verification and subscription tokens and, when `CUSTOM_DOMAIN_TARGET` is configured, mark a test custom domain verified. Those checks exercise application behavior without calling live email or verifying public DNS. The smoke writes directly to that database, so use the same disposable database your test services use.

## Release gates

Before opening an instance to the public, assign owners and validate the following on the target deployment:

- Account email verification and password reset/recovery end-to-end flows with real email, plus session revocation and account deletion against real storage.
- Abuse reporting, site-wide moderation beyond each author's block list, anti-spam and a private vulnerability reporting channel.
- Resend domain verification, real delivery, bounce/complaint webhooks, suppression and retry-window behavior.
- Real OpenAI requests, quotas/cost controls and privacy disclosures if AI is enabled.
- PostgreSQL and media backups, restore tests, least-privilege credentials, TLS for hosted services, and upgrade rehearsal.
- Shared/perimeter rate limits for multiple instances; current in-process limits are not distributed. Each limit purpose (client address, login, signup, and so on) keeps at most 10,000 counters per process. The shared write limit counts IPv6 clients by their /64. A full view-counter or client-address store evicts the counter closest to expiry, so new clients are never locked out of writing; every other full store (login, signup and so on) refuses new keys with 429 until counters expire, so flooding new keys cannot reset those counters but can briefly lock out new clients of that purpose. Put perimeter limits in front for large deployments.
- Browser clipboard fidelity, upload limits, accessibility and mobile rendering with realistic documents.
- Queue backlog/dead-letter alerts, worker lease recovery, graceful shutdown and deployment rollback.
- Dependency vulnerability review and image build/runtime validation on the actual deployment platform.

For enabled custom domains, verify DNS ownership, certificate issuance, public reading, and supported reader actions on a test domain. See the [verification record](VERIFICATION.md) for dated checks and [product scope](PLAN.md) for supported features.

## Dependency audit notes

The 2026-11-10 audit replaced Tailwind Typography's pinned `postcss-selector-parser` 6.0.10 with the compatible 6.1.5 patch through a narrow root override. [GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf) concerns inefficient selector parsing. Jot uses this path for trusted build-time CSS rather than reader-authored selectors; its local severity is P3. The post-change Bun registry audit reported no known vulnerabilities across 222 packages.

The official Go scan reported no reachable vulnerable symbol. The module-level [GO-2026-5932](https://vuln.go.dev/ID/GO-2026-5932.json) advisory applies to `golang.org/x/crypto/openpgp`; Jot imports `bcrypt` and does not import the affected OpenPGP package. No prerelease upgrade was made to suppress that unrelated package advisory. These results describe the audited dependency set and date, not a guarantee about future vulnerabilities.
