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

Roll out API and worker from the same source revision. Check health, read/write flows and queue processing after each rollout; roll back the image only if the schema remains compatible.

For upgrades from schema 1, stop the old API and worker before applying migrations, then start the new versions together. The summary backfill and URL reservations must not be followed by writes from an old application version. Migration 2 preserves a currently published slug, or the latest historical slug of an unpublished post. Conflicting legacy claims stop the whole migration transaction with a repair hint; back up and resolve the named posts deliberately rather than changing their URLs automatically. Rehearse this upgrade against a restored database first.

## Demo fixtures

All demo data lives in `scripts/fixtures`; `scripts/seed.ts` uses normal signup/login, draft save and publish APIs. Start the API against the intended development database and run `SEED_PASSWORD=your-demo-password bun run seed`. `SEED_BASE_URL` defaults to `http://127.0.0.1:8080`; it can instead point to the running web/Caddy origin. `APP_ORIGIN` must match the API's configured origin.

The password must be explicit and 10-72 bytes. Existing account passwords/details are never changed; a wrong password or username mismatch fails. Existing fixture slugs, including drafts, are skipped. The script does not email subscribers. `db:seed` is an alias for this HTTP command, and no demo data or seed business logic lives under `apps/api`.

## Storage and providers

Local storage is the default. Persist and back up `UPLOAD_DIR`, and serve it only through the validated media route. Images have public URLs and are not protected by draft ownership. Docker context rules exclude private environment files at every workspace depth; CI probes nested web/API environment fixtures before image builds. In production, configure `S3_BUCKET`, `S3_REGION`, optional `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` and `S3_PUBLIC_URL`. Restrict credentials to the required bucket operations. Set correct bucket/CDN public access and CORS policy, verify image upload/read/delete behavior, and establish a retention policy. The app does not claim garbage collection of orphaned images.

For Resend, configure a verified sending domain and `EMAIL_FROM`. Subscription confirmation requires user action; avoid sending publication emails to unconfirmed addresses. Test confirmation expiry, unsubscribe, one-click unsubscribe, retry failures and cancellation. Provider idempotency is bounded by the provider's window; exactly-once delivery is not guaranteed. The worker persists the first serialized Resend request under the current lease, without storing an API key, and reuses that exact request across configuration/template changes. Each attempt still checks the current subscription generation, publication and lease. Stored requests contain recipient addresses and link tokens and follow the existing 30-day terminal email-job retention; run the worker for maintenance and include this retention in your privacy policy. Retryable provider responses honor `Retry-After` within the job deadline. Resend concurrent-idempotency conflicts remain retryable, while a different-payload conflict is terminal. An unsubscribe/unpublish that arrives after a provider request is already in flight cannot recall that message. Delivery/bounce/complaint reconciliation and automated suppression must be completed before broad sending.

OpenAI is optional. Set `OPENAI_API_KEY` and `OPENAI_MODEL`. Requested text leaves your server for that provider; disclose this in your privacy policy. AI review identifies possible gaps and does not verify facts. Observe quotas, cost and job failures. Incomplete/truncated and refused responses fail with a safe explanation rather than appearing as completed suggestions or consuming repeated identical retries. Keep all network calls out of publishing transactions.

## Verification

CI installs the frozen Bun lockfile, runs migrations against isolated Postgres, checks types/Go vet, runs unit/database tests and Go race tests, builds all workspaces, then starts the production web/API for `scripts/integration/http-smoke.ts`. A separate CI job validates Caddy/Compose, builds both container images, starts the full stack, and runs the HTTP smoke through Caddy. Actual run results are reported separately; a workflow file is not proof it passed.

For local HTTP tests, start the app against a disposable database, then run `bun run test:integration`. Its fixture creates randomized accounts and exercises session/origin rules, ownership, concurrency, draft/live separation, publishing/cache visibility and reader interactions. It removes its post but retains the test accounts. Never point it at a production database.

## Release gates

This repository is an initial self-hostable implementation, not a verified public production deployment. Before public exposure, assign owners and validate:

- Account email verification and password reset/recovery end-to-end flows with real email, plus session/account deletion procedures.
- Abuse reporting, moderation, anti-spam and a private vulnerability reporting channel.
- Resend domain verification, real delivery, bounce/complaint webhooks, suppression and retry-window behavior.
- Real OpenAI requests, quotas/cost controls and privacy disclosures if AI is enabled.
- Hosted S3/Neon configuration, least-privilege credentials, TLS, backup/restore and upgrade rehearsal.
- Shared/perimeter rate limits for multiple instances; current in-process limits are not distributed.
- Browser clipboard fidelity, upload limits, accessibility and mobile rendering with realistic documents.
- Queue backlog/dead-letter alerts, worker lease recovery, graceful shutdown and deployment rollback.
- Dependency vulnerability review and image build/runtime validation on the actual deployment platform.

Features deferred by the product plan include custom domains, analytics, following authors, video and password-protected posts. Do not advertise them as implemented. Append final verified checks and remaining gaps to `PLAN.md` during integration.

## Dependency audit notes

The 2026-11-10 audit replaced Tailwind Typography's pinned `postcss-selector-parser` 6.0.10 with the compatible 6.1.5 patch through a narrow root override. [GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf) concerns inefficient selector parsing. Jot uses this path for trusted build-time CSS rather than reader-authored selectors; its local severity is P3. The post-change Bun registry audit reported no known vulnerabilities across 222 packages.

The official Go scan reported no reachable vulnerable symbol. The module-level [GO-2026-5932](https://vuln.go.dev/ID/GO-2026-5932.json) advisory applies to `golang.org/x/crypto/openpgp`; Jot imports `bcrypt` and does not import the affected OpenPGP package. No prerelease upgrade was made to suppress that unrelated package advisory. These results describe the audited dependency set and date, not a guarantee about future vulnerabilities.
