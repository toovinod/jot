# Contributing

The [architecture guide](docs/ARCHITECTURE.md) maps project responsibilities. The [API reference](docs/API.md) describes the request, response, and document formats.

Use [GitHub Issues](https://github.com/toovinod/jot/issues) for bugs and feature requests. Include the Jot revision, how you ran it, and what you expected to happen. Keep real writing, account details, subscriber addresses, logs containing secrets, and `.env` files out of issues and commits. Follow [Security](SECURITY.md) for vulnerabilities.

## Develop from source

Fork and clone the repository. Install Bun 1.4.4, a Go installation that can use the module's pinned Go 1.27.4 toolchain, and Docker Compose for PostgreSQL. From the repository root:

```sh
bun install --frozen-lockfile
cp .env.example .env
bun run db:up
bun run db:migrate
bun run dev
```

If you already created `.env` for the Docker preview, keep it and stop the preview before starting source development. Edit the local database URL in `.env` if you changed the database port or credentials. The web app runs at [localhost:3000](http://localhost:3000), the API at port 8080, and the local PostgreSQL at port 5433 by default. Turbo starts the worker alongside the web and API. Run `bun run worker` to start the worker on its own and `bun run db:down` to stop the development database while keeping its volume.

For sample content, follow the [demo fixtures guide](docs/OPERATIONS.md#demo-fixtures).

## Checks

Run these from the repository root:

```sh
bun install --frozen-lockfile
bun run format:check
bun run verify
```

`bun run verify` runs source policy, TypeScript, Go vet, workspace tests, and production builds. Husky installs the pre-commit hook during `bun install`. The hook applies staged formatting and runs `bun run check` and `bun run test`. Format a file directly with Prettier or gofmt, or run `bun run format` for the entire repository.

For database integration tests, set `JOT_TEST_DATABASE_URL` to a dedicated PostgreSQL database the tests can migrate and modify. To run the backend race tests against it:

```sh
cd apps/api
go test -race ./...
```

Export `JOT_TEST_DATABASE_URL` before using `go test` directly. For cross-service changes, run the [HTTP smoke test](docs/OPERATIONS.md#verification) against a disposable stack with web, API, and worker running. It creates accounts and writes content. Use `bun run check:containers` for Compose changes.

## Pull requests

- Explain the user-visible change, how you tested it, and any relevant test limits.
- Update the Go handlers, TypeScript contracts, and API docs together when changing a request or response shape.
- For database changes, check upgrades from existing data and document backup or rollback implications.
- For UI changes, check the affected flows at desktop and mobile widths, including keyboard navigation.

Contributions are accepted under the [MIT License](LICENSE).
