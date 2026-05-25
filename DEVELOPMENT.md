# Development

Development notes for `@crankshift/opencode-remote`.

## Prerequisites

- Node.js 22.18.0 or newer. Node.js 24 LTS is recommended.
- pnpm 10.11.0.

## Install Dependencies

```bash
pnpm install
```

## Run From Source

Run the gateway from source:

```bash
pnpm start
```

Run in watch mode during development:

```bash
pnpm dev
```

`pnpm start` executes `src/bin/opencode-remote.js run` and uses the normal app-state database. `pnpm dev` runs the same gateway in watch mode with `--state-suffix dev`, so development state is stored in `opencode-remote-dev.db` instead of the production `opencode-remote.db`.

## Build

Build the publishable package output:

```bash
pnpm run build
```

The build uses `tsdown` and writes ESM output to `dist/`.

## Checks

Run linting:

```bash
pnpm run lint
```

Run tests:

```bash
pnpm test
```

Run the package smoke check:

```bash
pnpm run smoke:package
```

Run the full local check:

```bash
pnpm run check
```

Default tests mock external systems. They do not require live Telegram, live OpenCode, Groq, or TTS services.

## Release

Releases publish to npm from GitHub Actions using npm trusted publishing. The repository does not need an `NPM_TOKEN` secret.

Before using tag-triggered releases, configure a trusted publisher for `@crankshift/opencode-remote` on npmjs.com. It must match the GitHub repository and workflow filename `publish.yml`.

To publish a release:

1. Update `package.json` version and `CHANGELOG.md`.
2. Run `pnpm run check`.
3. Commit the release changes.
4. Tag the commit with `vX.Y.Z`, matching the package version.
5. Push the commit and tag.
6. Verify the `Publish to npm` GitHub Actions workflow completes and the package appears on npm.

The workflow runs `pnpm run check` before `npm publish --access public`.
