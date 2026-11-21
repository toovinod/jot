<p align="center">
  <img src="apps/web/src/app/icon.svg" width="96" height="96" alt="Three fanned pages" />
</p>

<h1 align="center">Jot</h1>

<p align="center">An open-source writing and publishing app.</p>

<p align="center">
  <a href="#about">About</a> ·
  <a href="#quick-start">Quick start</a> ·
  <a href="docs/OPERATIONS.md">Self-hosting</a> ·
  <a href="#documentation">Documentation</a> ·
  <a href="CONTRIBUTING.md">Contributing</a>
</p>

## About

Jot turns notes and Markdown into pages you can publish at `/@username/slug`. Paste existing writing or start with a blank page. Edit rich text, images, and code, then choose the page's typography, width, and theme.

Publish publicly or unlisted, schedule a release, or share a read-only draft link. You can keep editing after publishing. Readers see the published edition until you publish again. Public posts appear on author profiles, in discovery, and in RSS. Email newsletters and Jot AI are optional.

## Quick start

With Docker and Docker Compose installed, run:

```sh
git clone https://github.com/toovinod/jot.git
cd jot
cp .env.example .env
docker compose --profile app up --build -d --wait
```

Open [localhost:3000](http://localhost:3000) to sign up, write, and publish. The local stack uses PostgreSQL and disk storage. See the [operations guide](docs/OPERATIONS.md#public-deployment) for public HTTPS, backups, and provider setup.

## Documentation

- [Architecture](docs/ARCHITECTURE.md) explains how the web app, Go API, PostgreSQL, and worker fit together.
- [API reference](docs/API.md) documents routes, data formats, and limits.
- [Product scope](docs/PLAN.md) and [verification](docs/VERIFICATION.md) record supported features and testing history.

## Contributing

See the [contributor guide](CONTRIBUTING.md) for Bun and Go setup, tests, and pull requests. Share bugs and feature requests in [GitHub Issues](https://github.com/toovinod/jot/issues). For vulnerabilities, follow the [security policy](SECURITY.md).

## License

Jot is licensed under the [MIT License](LICENSE).
