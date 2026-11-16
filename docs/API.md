# Jot API contract v1

Go owns `/api/*`; Next proxies these routes without exposing database/provider credentials. All responses are JSON except media/health. Error shape: `{ "error": "human-readable message", "code": "optional_machine_code" }`. Never return raw SQL/provider errors. All private responses use `Cache-Control: no-store`. Unsafe requests require `Origin: APP_ORIGIN` (except the standard email one-click-unsubscribe endpoint, which authenticates with its secret token).

Canonical frontend types and appearance defaults are in `packages/contracts/src/index.ts`. Keep Go JSON property names identical. Public `User` has only `id, username, name, bio, avatar`. No account email/password/session data. Timestamps are RFC3339. Arrays return `[]`, never null. UUIDs are strings. `Post.revision` is an optimistic concurrency version. `Post.published` is an optional Snapshot; public endpoints expose only published values, never draft values. Post counts are `likes` and `comments`. Private full posts include optional `reservedSlug`, the immutable reserved publication slug. Public full posts omit this private field and the optional duplicate `published` snapshot.

Lists return `PostSummary`, not full documents: `id, author, title, subtitle, slug, cover, visibility, revision, createdAt, updatedAt, publishedAt?, likes, comments, excerpt, readingMinutes, isPublished, reservedSlug?`. Excerpts contain at most 220 Unicode characters and reading time uses 220 words per minute, with a minimum of one minute. Public feed, profile and bookmark summaries use only stored published metadata; owned-library summaries use stored draft metadata. Summaries contain no `content`, `appearance`, or nested `published` snapshot. The optional `reservedSlug` appears only in owned-library responses.

## Routes

- `GET /api/health` → `{status:"ok"}` or 503 if DB is unavailable.
- `GET /api/config` → `{aiEnabled:boolean,emailEnabled:boolean}`.
- `POST /api/auth/signup` `{email,password,username,name}` → 201 User + session cookie.
- `POST /api/auth/login` `{email,password}` → User + session cookie.
- `POST /api/auth/logout` → `{ok:true}`; revoke cookie/session.
- `GET /api/me` → User or 401.
- `PATCH /api/me` `{name,bio,avatar}` → User. Username immutable initially. The web client sends `X-Jot-User-ID` with the displayed account ID; a supplied ID that differs from the cookie session returns 409 `identity_changed` before any write.
- `GET /api/authors/{username}` → `{author:User,posts:PostSummary[]}`; public posts only.
- `GET /api/posts?q=&sort=latest|popular&limit=20&offset=0` → `{posts:PostSummary[]}`; public feed, bounded pagination.
- `GET /api/posts?scope=mine|bookmarks` → `{posts:PostSummary[]}`; authenticated. Bookmarks only return accessible published posts.
- `POST /api/posts` → 201 Post with empty draft and default appearance.
- `GET /api/posts/{id}` → author-only draft Post.
- `PUT /api/posts/{id}` `{...Snapshot,revision:number}` → saved Post; 409 on stale revision.
- `POST /api/posts/{id}/publish` `{revision:number,emailSubscribers:boolean}` → Post; transactional snapshot + revision + optional delivery jobs. Only public posts may be emailed.
- `POST /api/posts/{id}/unpublish` `{revision:number}` → Post.
- `DELETE /api/posts/{id}` → `{ok:true}`; author-only.
- `GET /api/posts/{id}/revisions` → `{revisions:RevisionSummary[]}`; author-only, at most 100 entries containing `id, title, createdAt`. Restoration loads the full historical snapshot on the server.
- `POST /api/posts/{id}/restore` `{revision:number,versionId:number}` → Post; restore snapshot into draft without changing live publication.
- `GET /api/public/{username}/{slug}` → published Post or 404, including unlisted links; no draft leakage.
- `POST /api/uploads` multipart field `file` → 201 `{url:string}`; auth, signature/size validation; PNG, JPEG or GIF up to 10 MiB and 40 megapixels. At most four uploads per API process may decode/buffer concurrently; excess requests return 429 before their multipart body is read. Durable author limits are 20 uploads and 50 MiB per hour, 256 MiB total, and 2000 assets.
- `GET /media/{key}` → immutable uploaded image for local-disk mode. Uploaded images are public assets with unguessable names; drafts themselves stay private.
- `GET /api/posts/{id}/engagement` → `{liked:boolean,bookmarked:boolean,likes:number,comments:Comment[]}`; published posts only, optional session.
- `PUT /api/posts/{id}/like` `{active:boolean}` → `{ok:true}`; auth, idempotent.
- `PUT /api/posts/{id}/bookmark` `{active:boolean}` → `{ok:true}`; auth, idempotent.
- `POST /api/posts/{id}/comments` `{body:string}` → 201 Comment; auth, plain text, length bound.
- `DELETE /api/posts/{id}/comments/{commentId}` → `{ok:true}`; comment owner or post author.
- `POST /api/ai/jobs` `{postId:string,mode:"grammar"|"structure"|"review",text:string}` → 202 `{id:string}`; owned post, configured provider, bounded input and per-author quota.
- `GET /api/ai/jobs/{id}` → `{id,status:"pending"|"running"|"completed"|"failed",result?:string,error?:string}`; owning user only.
- `POST /api/authors/{username}/subscribe` `{email:string}` → `{ok:true}`; generic response whether existing/new; enqueue confirmation if configured.
- `POST /api/subscriptions/confirm` `{token:string}` → `{ok:true}`; idempotent confirmation, expiring token.
- `POST /api/subscriptions/unsubscribe` `{token:string}` → `{ok:true}`; idempotent, cancel queued newsletters.
- `POST /api/subscriptions/one-click?token=...` → `{ok:true}`; RFC8058 form request, token-authenticated, no cookie/origin requirement.

## Web routes

`/` public discovery/landing, `/login`, `/signup`, `/dashboard`, `/editor/[id]`, `/settings`, `/[handle]` for `@username`, `/[handle]/[slug]`, `/subscriptions/confirm?token=...`, `/subscriptions/unsubscribe?token=...`. Confirmation/unsubscribe pages require a user action rather than mutating state on a GET.

## Content and UX rules

Document type is a Tiptap/ProseMirror JSON document. Supported nodes: doc, paragraph, text, heading (1–6), bulletList, orderedList, listItem, blockquote, codeBlock, hardBreak, horizontalRule, image, table, tableRow, tableCell, tableHeader, taskList, taskItem. Supported marks: bold, italic, strike, code, underline, link. Sanitize/validate URLs and node bounds server-side and render with React nodes, not raw HTML. Appearance layout is a permutation of header, cover, content, author.

AI content is a suggestion. Show the original/requested text and resulting suggestion. Copying suggestions is supported; accepting must be explicit and must not silently remove images or apply to a changed document. Review mode flags possible gaps, does not assert source-verified corrections.

Full-text query initially searches published title/subtitle using parameterized SQL. Authenticated drafts, engagement state and AI status are never shared-cacheable. Public ETags must follow visibility checks; unpublish and deletion cannot be bypassed by a cached response.

## Validation and operations

Image document attributes may contain nullable `width` and `height`, or integer pixel dimensions from 1 to 12000 (numeric strings from pasted HTML are accepted). Persisted text rejects actual NUL characters with 400; literal code examples containing the characters `\u0000` remain valid.

Deleting a post cancels and redacts associated AI work transactionally, including completed source/result copies. Enqueue locks the owned post until its transaction commits, so concurrent deletion cannot miss new work. A request already sent to an external provider cannot be recalled. Switching a publication to unlisted also cancels previously queued newsletter work.

Run the migration command before restarting the API and worker. Version 002 reserves publication slugs even while posts are unpublished. For legacy posts it preserves the current published slug, or the latest historical published slug when unpublished; older historical URLs never displace a current publication. New posts reserve their slug on first publication. A legacy historical collision stops the migration without changing URLs; back up/export the affected posts and explicitly resolve the duplicate as described by the migration error before retrying. Version 003 backfills bounded list metadata from each draft and publication using the same summary function used by normal saves and publishing. All migration versions and backfills commit in one transaction; rerunning is idempotent.

`APP_ENV` accepts `development`, `test`, or `production`; an unset value uses development behavior. Production requires an HTTPS `APP_ORIGIN`. S3 mode requires its bucket, access key, secret key and public URL together. Public image base URLs must be absolute HTTP(S) URLs without credentials, query or fragment, and must use HTTPS when the application does.

If an S3 write attempt fails after transmission, its outcome may be unknown. Its `media_assets` reservation stays charged against storage and hourly limits. Administrators should compare the recorded key against object storage before resolving a reservation; no automatic process deletes objects based solely on a failed response. A local file failure releases its reservation only when no file was created or removal succeeded.
