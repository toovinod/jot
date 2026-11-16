# Contributing

Start with README setup, `docs/ARCHITECTURE.md` and `docs/API.md`. Use a dedicated development database and fake provider credentials. Keep secrets, real writing, subscriber addresses, local media and `.env` files out of commits.

Make focused changes with one owner for document shapes, API errors, appearance defaults, rendering and job behavior. Update contracts and their consumers together when changing JSON. Add meaningful regression coverage for authorization, concurrency, persistence and asynchronous behavior; avoid tests that only repeat an implementation.

Before submitting a change, run:

```sh
bun install --frozen-lockfile
bun run db:migrate
bun run format:check
bun run check
bun run test
bun run build
(cd apps/api && go test -race ./...)
bun run test:integration
```

Run the HTTP integration script with the API and web service already running and an isolated database. State which provider and container paths were actually exercised. For UI changes, inspect the editor and reading view at desktop and mobile widths with keyboard navigation. For database changes, include migration and backup/rollback implications; migrations must support an upgrade from existing data.

Pull requests should explain the user-visible problem, resulting behavior, validation, and material remaining gaps. Do not describe configured-but-untested providers or deployment as verified. Contributions are accepted under the repository's MIT license.

Husky installs the pre-commit hook during `bun install`. The hook formats staged code/doc files with lint-staged, formats staged Go with gofmt, then runs workspace checks and tests. lint-staged protects partially staged changes with its normal stash workflow. Run `bun run format` after broad edits. CI repeats the checks even when a hook is skipped.

`bun run check:source` checks authored text for em dashes and emoji without changing files. Generated files, dependency locks, private environment files and binary assets are excluded. Release archives and systems without Git use a bounded filesystem inventory; regular Git checkouts retain Git ignore behavior. Deleted files and symlink targets are not read. Useful comments are reviewed manually. TypeScript checks also reject unused local declarations and parameters.
