# Product scope

Jot is an MIT-licensed, self-hostable writing and publishing app. The core workflow is to open a blank page or bring existing writing into the editor, edit and style it, then publish it at `/@username/slug`.

## Implemented

- Rich-text paste, Markdown import and export, code blocks, tables, task lists, and image uploads. Clipboard fidelity depends on the formats and assets supplied by the source app.
- Autosaved drafts with revision checks and browser recovery. A draft can be shared with a revocable, read-only link.
- Public and unlisted publishing, scheduled releases, stable published URLs, and edition history. Restoring an edition changes the draft. Readers see the published edition until the author publishes again.
- Author profiles, discovery, tags, RSS, sitemaps, likes, bookmarks, views, comments and replies, and author-level reader blocking.
- Email subscriptions with confirmation and unsubscribe, optional newsletter delivery with Resend, and optional author custom domains with DNS verification and TLS.
- Optional Jot AI chat and writing suggestions. Authors choose when to request help and whether to apply proposed edits.
- Markdown account export and account deletion.

## Deferred

Detailed reader analytics, following authors, video support, and password-protected posts are outside the current feature set.

## Release and maintenance

The [architecture guide](ARCHITECTURE.md) describes the implementation boundaries, the [operations guide](OPERATIONS.md#release-gates) covers public hosting, and the [verification record](VERIFICATION.md) identifies which checks ran and against which environments. The initial implementation plan and task assignments are available in Git history.
