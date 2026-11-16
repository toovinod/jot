# Jot

An open-source writing canvas for turning existing notes into readable public pages. Paste or import writing, edit rich text and code, adjust typography and page order, then publish a snapshot at `/@username/slug`. Draft edits stay private until you publish again.

Built with Bun workspaces and Turborepo, Next.js/React/Tiptap, and a Go API and independent worker backed by Postgres. MIT licensed. This is an initial implementation; review the [release gates](docs/OPERATIONS.md#release-gates) before exposing it to the public.

## Local setup

Install Bun **1.4.4**, Go **1.27.4** (or a Go installation that can download the module's pinned toolchain), and Docker Compose for local Postgres. Bun installs workspace dependencies and runs Next.js and the JavaScript tooling. Go runs the API, worker, and migrations.

```sh
bun install --frozen-lockfile
cp .env.example .env
bun run db:up
bun run db:migrate
bun run dev
```

Open [localhost:3000](http://localhost:3000). The API listens on port 8080 and the web server proxies `/api` and `/media`. The worker starts alongside them through Turbo; it can also run independently with `bun run worker`. Optional integrations are disabled when their keys are absent. Start the API first, then `SEED_PASSWORD=your-demo-password bun run seed` adds sample public writing for local exploration through the normal HTTP API. Use a unique 10-72 byte password; optional `SEED_EMAIL` and `SEED_USERNAME` override the demo identity.

For Neon, link the CLI to your project and run `neon deploy` with `neon.ts`. The CLI pulls the pooled `DATABASE_URL` for the API and worker and `DATABASE_URL_UNPOOLED` for migrations. To serve images from the declared `jot` bucket, set `S3_BUCKET=jot`. The API uses the CLI's `AWS_*` variables and serves public image URLs from the branch's storage endpoint. Run `bun run db:migrate` before starting the app. Keep provider and database credentials in the ignored root `.env`.

## Commands

| Command                    | Purpose                                               |
| -------------------------- | ----------------------------------------------------- |
| `bun run dev`              | Web, API and independent worker                       |
| `bun run check`            | TypeScript checks and Go vet                          |
| `bun run test`             | Unit and configured database tests                    |
| `bun run build`            | Production web build and Go binaries                  |
| `bun run verify`           | Checks, tests and build                               |
| `bun run test:integration` | HTTP flow against running app; isolated DB required   |
| `bun run seed`             | Publish missing demo fixtures through the running API |
| `bun run db:migrate`       | Apply embedded migrations                             |
| `bun run db:down`          | Stop local Compose services, preserving volumes       |

Set `JOT_TEST_DATABASE_URL` to a dedicated test database to enable Go database integration tests. Set `JOT_SMOKE_URL` to exercise another running origin with the HTTP smoke script. The smoke script creates accounts and content; use a disposable database. CI supplies Postgres and runs the full checks, race tests, production build and cross-service smoke.

## Integrations and self-hosting

- **Resend:** provide `RESEND_API_KEY` and an `EMAIL_FROM` address on a verified domain. Subscription confirmation and publication email are queued; run the worker continuously. Test confirmation, unsubscribe, deliverability and provider errors before enabling email publicly.
- **OpenAI:** set `OPENAI_API_KEY` to enable grammar, structure or knowledge-gap suggestions. The default model is `gpt-6-luna`, and `OPENAI_MODEL` can override it. Suggestions require review and never publish automatically.
- **Images:** local disk works without a storage provider. Persist `UPLOAD_DIR`, or configure S3-compatible storage and its public base URL through `S3_PUBLIC_URL`. Uploaded images are public, unguessable assets even when attached to a draft.

[Self-hosting and operations](docs/OPERATIONS.md) covers containers, sanitized Caddy ingress, TLS, backups, queues and release limitations. [Architecture](docs/ARCHITECTURE.md), [API contract](docs/API.md), [implementation plan](docs/PLAN.md), [contributing](CONTRIBUTING.md), and [security](SECURITY.md) describe the boundaries and review expectations. The [scaffold record](docs/SCAFFOLD.md) documents the official `create-turbo` foundation and its adaptations.
