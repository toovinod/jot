# Official Turborepo foundation

This is a provenance record for the original workspace. For current setup instructions, see the [contributor guide](../CONTRIBUTING.md#develop-from-source).

On 2026-11-10 the Turborepo generator was run in a temporary directory, with dependency installation and Git initialization disabled:

```sh
bunx create-turbo@latest /private/tmp/jot-turbo-20261110 \
  --package-manager bun --skip-install --no-git
```

The resolved generator was `create-turbo@2.11.10`. Its official template used Turbo 2.11.10, TypeScript 7.0.2 and Bun 1.4.4. Exact generated root files are preserved as `docs/scaffold/generated-package.json` and `generated-turbo.json` for provenance; these are records, not active workspaces.

Jot retained the Bun workspace structure, Turbo dependency-aware task execution, build input/output exclusions, persistent uncached development tasks, and generated shared TypeScript base/Next configs in `packages/typescript-config` (renamed from `@repo` to `@jot`). The web config extends this shared package and preserves the application's strict compiler settings. Dependency versions are pinned to resolved installed versions and `bun.lock` is included for frozen installation.

The default demo `apps/docs`, demo web content, button/card UI package and unused ESLint package were intentionally omitted. Jot supplies its own Next writing application, Go API, independently runnable Go worker, and shared document contracts. `check` runs TypeScript and Go vet instead of the template's default lint/check-types split. Go build outputs and runtime environment variables are included in Turbo configuration.
