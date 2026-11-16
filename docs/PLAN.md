# Jot - implementation plan

Status: implemented and verified locally. See [verification results](VERIFICATION.md) and [production release requirements](OPERATIONS.md#release-gates). No public deployment or remote repository has been created.

## Product

Jot is an MIT-licensed, self-hostable publishing app. A person signs up, pastes existing writing into an empty canvas, edits it, customizes its appearance, and publishes a readable page at `/@username/slug`. Author profiles collect public posts. Formatting preserves the writing; optional AI proposes grammar, structure, and knowledge-gap feedback for explicit review.

Support rich HTML clipboard content and plain text from Apple Notes, Google Docs, Notion, Word, and webpages; support Markdown import/shortcuts, code blocks, lists, tables, pasted images, image upload and drag/drop. Clipboard applications expose different data: preserve supported document structure, sanitize unsupported HTML, and disclose images that need re-upload rather than claiming lossless import. Video is deferred.

Readers can discover/search public posts, like, bookmark, comment, and subscribe to an author by email. Subscriptions use Resend, confirmation and unsubscribe. Following authors, custom domains, and analytics are deferred. Start with font, accent, reading width, light/dark preference and rearrangeable page sections; keep author content separate from visual settings.

## Architecture

- Generate the foundation using `bunx create-turbo@latest` with Bun workspaces.
- `apps/web`: Next.js App Router running on Bun, React, Tailwind, shadcn/ui, Tiptap, accessible sortable layout controls.
- `apps/api`: Go, Chi routing, pgx connection pooling, Postgres/Neon. Go owns authentication, authorization, persistence, uploads and integration APIs.
- `apps/worker`: independently runnable Go worker command sharing the API domain/services, migrations and job queue. No duplicated business logic.
- `packages/contracts`: frontend data shapes, input schemas and defaults. Backend request/response contracts are documented and tested against integration fixtures.
- Neon stores accounts, sessions, documents, publication snapshots, revisions, reactions, subscriptions and durable jobs. S3-compatible storage holds images; local disk is supported for self-hosting with a persistent volume.
- Browser API calls use same-origin `/api` proxying. No provider credentials or database connections enter the browser bundle.

## Publishing and consistency

1. The editor starts empty, autosaves only drafts and tracks save state/errors.
2. Saves carry a revision for optimistic concurrency; stale clients cannot silently overwrite newer drafts.
3. Publishing validates a complete snapshot and copies it transactionally to published state. Live rendering uses only that state.
4. Public posts appear in discovery and author lists; unlisted posts are accessible by link and excluded from lists. Private work remains a draft. Password-protected posts are deferred rather than implemented superficially.
5. Published slugs remain stable. Authors can publish updates, unpublish, delete and restore published revisions into the draft.
6. Email notification is an explicit publish option. The database transaction creates delivery work; no network request is inside the publishing transaction.

## Async work and caching

- Durable Postgres jobs with atomic claims, leases, bounded retries, backoff, idempotency keys and failure states. API and worker restart independently.
- Queue AI requests; poll authorized job status. AI results are suggestions and never publish or replace content automatically. Knowledge review flags uncertainty; it does not claim independently verified facts.
- Queue subscription confirmation and publication emails. Check active subscription state before delivery; cancel pending newsletter work on unsubscribe/unpublish where appropriate.
- Resend idempotency keys are reused for retries within its documented 24-hour window. Do not promise exactly-once delivery beyond provider guarantees.
- Cache immutable image objects with long-lived headers. Use ETags/conditional responses for public content, with publication authorization/visibility checked before serving cached data. Never share-cache drafts, sessions or account responses.
- Bound memory caches and rate-limiter maps; define expiry and multi-instance limitations. Avoid adding Redis before a concrete requirement justifies it.

## Security and operations

- Hashed passwords, opaque hashed sessions, HttpOnly/SameSite cookies, Secure in production, origin checks and rate limits.
- Ownership on every private resource; no email addresses or subscription lists in public author objects.
- Safe structured-document rendering, URL validation, upload signature/size checks, no arbitrary server-side remote-URL fetching.
- Parameterized SQL, migration history, transactional changes, unique constraints and indexed lookup paths.
- Health/readiness checks, HTTP deadlines, graceful shutdown, structured logs without secrets, documented configuration and health checks for containers.
- Keep integration keys in ignored environment files. Check environment availability and show honest disabled states for unconfigured AI/email.
- Production release gates include verified sending domain, hosted storage, TLS/cookie configuration, database migration/backup procedure, account recovery/verification, abuse handling and provider delivery checks. Clearly record any unimplemented gate.

## DRY boundaries

Use one document model, renderer, appearance configuration, API client/error format, ownership/session middleware and reusable UI primitives. API and worker share job/domain code. Centralize SQL scanning and validation. Extract repeated behavior when it exists; avoid speculative generic layers and duplicate state.

## Work allocation - three GPT-6.1 Sol agents

1. **Web:** editor, application pages, reading renderer, profiles/discovery, customization, reader interactions, AI and subscription UI. Own `apps/web/src` and frontend tests.
2. **API/worker:** schema/migrations, auth, posts, uploads, social features, durable queue, AI and Resend integrations. Own `apps/api` and `apps/worker` source.
3. **Platform/verification:** official Turborepo scaffold review, workspace/build/deploy scripts, containers, CI, MIT license, contributor/setup/deployment docs and meaningful cross-service smoke tests. Own root configuration, scripts and docs; coordinate contract tests with API/web agents.

The main agent establishes contracts, integrates changes, reviews all changed files and security-critical lines, resolves mismatches, and runs final checks. Agents do not publish, create a remote repository, commit or push.

## Delivery sequence

1. Generate official Turborepo baseline, confirm versions and install dependencies.
2. Freeze API/document/job contracts; build the three tracks in parallel.
3. Integrate against an isolated local Postgres database; exercise account → draft → upload → publish → public read → edit/unpublish.
4. Test cross-account denial, draft/public separation, stale writes, unsafe content, subscription confirmation/unsubscribe, provider retries and job lease recovery.
5. Run Go tests/vet/race where supported, frontend type checks/tests, production build and end-to-end HTTP smoke checks. Verify UI in an available authorized browser; record any browser limitation explicitly.
6. Review each changed file, document remaining release gates, and provide commands and local paths. No claim of verified production deployment without configured providers and deployment checks.

## Review completion

The 10 November 2026 review and implementation checks are recorded in `CODE_REVIEW.md` and `VERIFICATION.md`. Types, Go vet, source policy, formatting, unit/tooling tests, Postgres race tests, migration upgrades, production builds and cross-service HTTP smoke passed. Dia verified image persistence and draft recovery across an intentional API outage and Back navigation. No P0 was found; 37 grouped findings were fixed. Real provider accounts, hosted Neon/S3 and full container startup remain unverified release gates described in `OPERATIONS.md`.
