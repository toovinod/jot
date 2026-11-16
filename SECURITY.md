# Security

Do not post credentials, unpublished writing, subscriber addresses or exploitable account data in a public issue. No public security mailbox has been established for this initial repository; contact the maintainer through a private channel before sharing an exploit. Public hosting requires a defined private reporting channel and incident owner.

The Go service owns sessions, authorization, validation and provider credentials. Use HTTPS with the exact public `APP_ORIGIN`; this controls origin checks and whether session cookies are Secure. Place the web app behind a TLS reverse proxy and keep the API/database private. Never put provider keys in browser variables. Local media and public S3 objects are public assets; avoid sensitive image uploads.

Before public release, review the security and delivery gates in `docs/OPERATIONS.md`. Account verification and password recovery endpoints need real provider and end-to-end validation. Shared rate limiting and complete abuse/moderation procedures remain release requirements. Dependency updates need review and the complete checks, particularly document rendering, URL validation, upload signature validation, session cookies and cross-account tests.
