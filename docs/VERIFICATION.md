# Local verification

This page records checks against specific revisions and environments. For the steps to verify a new deployment, see [Operations](OPERATIONS.md#release-gates).

## Source checkout, 21 November 2026

- At `6c61b94`, all 294 frontend tests passed with Bun 1.4.4. A fresh local clone passed `bun install --frozen-lockfile`, `bun run db:migrate`, and startup of the web app, API, and worker via `bun run dev` against a disposable PostgreSQL 14.19 instance.
- The Go suite passed with `JOT_TEST_DATABASE_URL` set to the disposable database, including database integration tests.
- The HTTP smoke passed all 18 checks against the running source stack, including image upload, draft isolation, public page rendering, scheduled publication by the worker, RSS, and account deletion. It used disposable database fixtures for email tokens and custom-domain verification.
- Both Compose configurations resolved successfully. This pass used native PostgreSQL for runtime tests. Container startup, live OpenAI and Resend requests, and public DNS and TLS were outside this pass.

## Initial implementation, 10 November 2026

- Official `bunx create-turbo@latest` scaffold with Bun workspaces; provenance in `SCAFFOLD.md`.
- Frozen Bun installation, Prettier/Go formatting, source policy, strict TypeScript including unused symbols, and Go vet.
- Workspace tests: 43 frontend tests with 224 assertions, 5 tooling tests with 24 assertions, plus Go unit tests.
- Go race tests against an isolated Postgres database. Coverage includes cross-account access denial, stale and concurrent saves, private draft/public snapshot separation, revisions, account recovery/session revocation, quotas, email confirmation/unsubscribe, cancellation, job leases/fencing/retries and mocked provider requests.
- Held-request shutdown tests verify that the API waits for active requests and closes connections after the shutdown deadline.
- Full Turborepo production build: Next.js on Bun, Go API and independent Go worker.
- Cross-service HTTP smoke against both the development frontend and optimized production frontend. The final review reran the optimized frontend smoke, including actual public HTML/profile pages, editor image document persistence, compact list/history contracts, session/origin handling, publishing, draft isolation, ETags, reactions/comments/bookmarks, revisions and unpublish visibility.
- Actual-process image tests: anonymous denial, SVG rejection, PNG upload, public retrieval, exact byte round-trip and immutable cache headers.
- Root seed script first creates missing fixtures, then skips those fixtures on repeat without overwriting existing writing or account details.
- Compiled worker starts independently and consumes a harmless diagnostic job into its expected failed state for an unsupported job kind.
- Dia browser checks: login, blank canvas, rich HTML paste with headings/bold/lists/code, autosave, page-section controls, theme selection, publishing and public reading. The selected blue accent and light background were verified from rendered computed styles.
- Review browser checks: rich image paste survived autosave/reload, compact history rendered, and unsaved writing survived an intentional API outage followed by Back/Forward navigation and explicit recovery. Direct browser file upload was blocked by the extension's file-access setting; real multipart upload passed through HTTP smoke.
- Additive migrations upgraded the existing preview database and passed a repeated migration run. Integration tests cover schema 1 upgrades, multiple summary backfill batches and transactional rollback on historical slug collisions.
- Final Bun audit: 222 packages, no reported vulnerabilities. Official Go scanning found no reachable vulnerabilities; the module-only OpenPGP advisory does not affect the bcrypt code imported by Jot.
- Compose configuration, shell syntax and official Caddy configuration validation. A live Caddy proxy probe confirmed that spoofed forwarded client-identity headers are replaced or removed.

The initial implementation review corrected concurrent-save acknowledgements, password-reset/session races, rate-limit key bounds and expiration, exhausted-job cleanup, cancelled-job fencing, production image decoder registration, encoded author routing, server-side API configuration and theme/accent cascade priority. The subsequent severity-based review fixed 37 additional grouped findings. See `CODE_REVIEW.md` for their impact, fixes, regression evidence and verification boundaries.

### Limits of the 10 November run

The 10 November review used controlled provider responses. Hosted Postgres and storage were subsequently verified as described below. Resend delivery/domain verification and live OpenAI requests remain unverified. Clipboard structure is preserved within the supported editor schema. App-specific styles and private images can require manual review or re-upload. Uploaded clipboard attachments can move after pasted text, with an explicit warning.

The Docker daemon was stopped during this run, so it covered container configuration only. The full stack was exercised on 14 November, as recorded below.

See the [code review record](CODE_REVIEW.md) for the findings from this run.

## Neon setup verification, 14 November 2026

- `neon deploy` confirmed the production branch matched `neon.ts` and pulled the pooled and direct Postgres URLs plus Object Storage credentials into the ignored root `.env`.
- The production build completed all three tasks. The optimized web app, compiled API and worker started with the isolated Neon verification branch.
- Migrations used the direct Neon URL. The cross-service HTTP smoke used the pooled URL and passed signup/login, draft updates, publishing, public rendering and unpublish. A multipart PNG upload reached the Neon `jot` bucket and an anonymous GET returned the original bytes. The bucket listing confirmed the object existed.
- The same migrations applied to the production branch. Production health and public post queries were verified without creating test records there.
- Workspace tests, TypeScript, Go vet, formatting, Compose configuration and frozen installation passed. Bun audit reported no vulnerabilities across 251 packages.

## Version refresh verification, 14 November 2026

- The production build, workspace tests, formatting, TypeScript and Go vet passed with GPT-6 Luna configured. The OpenAI client test verified that the Responses request selected Luna with storage disabled. A live request requires an OpenAI API key.
- The complete Docker stack built and started with PostgreSQL 18.7, Alpine 3.24.4 and Caddy 2.11.9. Go database integration tests passed on PostgreSQL 18.7. The HTTP smoke through Caddy passed signup, image upload and public read, publishing and unpublish. The Docker context test verified that nested environment files stay excluded.
- The JavaScript registry audit found no vulnerabilities across 250 packages. Go's vulnerability scanner reported no vulnerabilities.
