# Architecture

| Workspace                    | Responsibility                                                                               |
| ---------------------------- | -------------------------------------------------------------------------------------------- |
| `apps/web`                   | Next App Router UI, rich-text editor, safe document renderer, reader interactions            |
| `apps/api`                   | Go HTTP server, sessions, authorization, persistence, publishing, uploads and queue services |
| `apps/worker`                | Independent process entry point using the API module's shared worker/domain implementation   |
| `packages/contracts`         | Browser JSON shapes, document helpers, appearance validation/defaults                        |
| `packages/typescript-config` | Shared official scaffold compiler foundations                                                |

The Go module separates the following internal packages:

| Package                                                              | Responsibility                                                            |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `config`                                                             | Environment parsing, origin validation and constrained proxy trust        |
| `database` and `database/migrations`                                 | Connection pooling and embedded schema migrations                         |
| `domain`                                                             | User/post/document/comment types, appearance defaults and validation      |
| `httpapi`                                                            | HTTP routing, session/ownership middleware and request handlers           |
| `jobs`                                                               | Atomic claims, leases, retries, delivery dispatch and bounded maintenance |
| `integrations/openai`, `integrations/resend`, `integrations/request` | Provider payloads and shared HTTP transport behavior                      |
| `security`                                                           | Opaque token generation and hashing                                       |

The API and worker share these packages. The worker does not import HTTP handlers.

The browser calls same-origin `/api`. Next rewrites to the private Go origin; the target is set by `API_INTERNAL_URL` at web build time. Go is the single authority for data, user ownership, session validation and provider calls. Postgres/Neon stores both draft and published state. Uploaded media goes to local persistent disk or S3-compatible object storage.

A save includes the draft revision. Publishing copies a validated draft to a public snapshot within a transaction; public reading, discovery and author lists use published values. Unlisted links can be read but are excluded from lists. Unpublishing must pass authorization/visibility checks even when a reader sends a previous ETag. Draft and account responses are never shared-cacheable. The HTTP integration script tests these boundaries against real services.

Provider work is durable Postgres queue state rather than an in-memory goroutine. The worker claims jobs, leases them, retries transient failures with bounded backoff, and records failure. The API and worker restart independently and share one module's service logic. Confirmation, notification delivery and AI work require a running worker. Monitor failures and queue age; a live worker process alone does not prove delivery success.

Public content uses ETags after visibility checks. Immutable image names permit long-lived media caching. Current request rate limits are local to one API process; running multiple API instances requires a shared limit or upstream enforcement. Avoid adding a cache layer that can serve stale protected/unpublished content.

See `API.md` for endpoint and document rules, and `OPERATIONS.md` for configuration and release boundaries.
