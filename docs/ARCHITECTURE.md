# Architecture

| Workspace                    | Responsibility                                                                               |
| ---------------------------- | -------------------------------------------------------------------------------------------- |
| `apps/web`                   | Next App Router UI, rich-text editor, safe document renderer, reader interactions            |
| `apps/api`                   | Go HTTP server, sessions, authorization, persistence, publishing, uploads and queue services |
| `apps/worker`                | Workspace commands for the independent Go process in `apps/api/cmd/worker`                   |
| `packages/contracts`         | Browser JSON shapes, document helpers, appearance validation/defaults                        |
| `packages/typescript-config` | Shared official scaffold compiler foundations                                                |

The Go module separates the following internal packages:

| Package                                                              | Responsibility                                                            |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `config`                                                             | Environment parsing, origin validation and constrained proxy trust        |
| `database` and `database/migrations`                                 | Connection pooling and embedded schema migrations                         |
| `domain`                                                             | User/post/document/comment types, appearance defaults and validation      |
| `httpapi`                                                            | HTTP routing, session/ownership middleware and request handlers           |
| `publishing`                                                         | Transactional publishing, edition history and newsletter job creation     |
| `jobs`                                                               | Atomic claims, leases, retries, delivery dispatch and bounded maintenance |
| `integrations/openai`, `integrations/resend`, `integrations/request` | Provider payloads and shared HTTP transport behavior                      |
| `security`                                                           | Opaque token generation and hashing                                       |

The API and worker share these packages. The worker does not import HTTP handlers.

The browser calls same-origin `/api`. Next rewrites requests to the private Go origin set by `API_INTERNAL_URL` at web build time. Go owns data, user ownership, session validation, and provider calls. PostgreSQL stores drafts, published editions, and jobs. Uploaded media goes to persistent local disk or S3-compatible object storage. In the shipped public Compose setup, only Caddy publishes external ports. Verified author domains route through Caddy and Next to the matching author's public pages.

The editor serializes autosaves and includes the current draft revision with each write. It also keeps a local recovery copy for unsaved edits. Manual and scheduled publishing share a transaction that copies the validated draft into the published snapshot, records an edition, and optionally queues newsletters. Discovery, public profiles, and feeds use public editions. Unlisted editions are readable by direct URL. Draft share tokens grant read-only access to the current draft and can be rotated or revoked. The HTTP smoke test exercises these boundaries against the running services.

The API enqueues AI and email jobs in PostgreSQL. The worker claims jobs with leases, retries transient failures with bounded backoff, and records terminal results. Each worker has two AI runners, a separate email runner, and a maintenance loop for scheduled publication and cleanup. Jot AI polls an authenticated status endpoint and presents suggested changes for explicit acceptance. The API and worker restart independently and share service code. Track queue age and failure rates alongside process health.

Public posts use ETags after visibility checks. RSS and sitemap results have a bounded per-process cache. Draft and account responses use `no-store`. Immutable image names permit long-lived media caching. Request rate limits run per API process. Use shared or upstream enforcement for a multi-instance deployment.

See `API.md` for endpoint and document rules, and `OPERATIONS.md` for configuration and release boundaries.
