# Security

Report suspected vulnerabilities privately. On the [repository Security page](https://github.com/toovinod/jot/security), use **Report a vulnerability** if available. If the option is unavailable, contact the repository maintainer privately and ask for a reporting channel before sharing details. Keep vulnerability details, credentials, private drafts, and personal data out of public issues.

Include the affected revision, the expected and observed behavior, and any relevant setup details. Redact sensitive data and use accounts and data you control.

## Self-hosting

Use HTTPS with the exact public `APP_ORIGIN` and keep the API and database behind the public ingress. Store provider credentials on the server. Uploaded images are public assets, even when attached to drafts. Draft share links should be treated like credentials because anyone with a valid link can read the draft until the link is revoked.

Before public hosting, establish a private reporting channel for your instance. Review the [release gates](docs/OPERATIONS.md#release-gates) for rate limiting, account recovery, abuse handling, and provider validation.
