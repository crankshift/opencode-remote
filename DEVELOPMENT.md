# Development

Development notes for `@crankshift/opencode-remote`.

## Prerequisites

- Node.js 22.18.0 or newer. Node.js 24 LTS is recommended.
- pnpm 11.3.0.
- Optional voice mode development: local `ffmpeg` for conversion and a Groq API key for live transcription smoke tests.

## Install Dependencies

```bash
pnpm install
```

`pnpm install` installs Lefthook Git hooks for local development. The pre-commit hook runs `pnpm run lint`, and the commit-msg hook runs commitlint to enforce Conventional Commit messages.

If hooks need to be reinstalled manually, run:

```bash
pnpm exec lefthook install
```

## Run From Source

Create the config interactively:

```bash
pnpm setup
```

Run the gateway from source:

```bash
pnpm start
```

Run in watch mode during development:

```bash
pnpm dev
```

`pnpm setup` executes `src/bin/opencode-remote.js setup` and rewrites the selected gateway config. When a config already exists at that selected local or global path, blank prompt input keeps the current value. `pnpm start` executes `src/bin/opencode-remote.js run` and uses the normal app-state database. `pnpm dev` runs the same gateway in watch mode with `--state-suffix dev`, so development state is stored in `opencode-remote-dev.db` instead of the production `opencode-remote.db`. If no config exists, `pnpm dev` starts the same interactive setup flow before starting the gateway.

## App State Storage

Gateway state is app-managed and stored in a SQLite database named `opencode-remote.db` under the platform app-data directory:

- Linux: `$XDG_DATA_HOME/opencode-remote/opencode-remote.db`, or `~/.local/share/opencode-remote/opencode-remote.db` when `XDG_DATA_HOME` is unset.
- macOS: `~/Library/Application Support/opencode-remote/opencode-remote.db`.
- Windows: `%LOCALAPPDATA%\opencode-remote\opencode-remote.db`, with `%APPDATA%` and `%USERPROFILE%\AppData\Local` fallbacks.

The database stores non-secret project state such as the active OpenCode session and `/progress` preference. It keys Git projects similarly to OpenCode: Git remote identity first, then a cached repo ID, then root commit. Non-Git folders use a shared global project identity. Generated voice files are cache under the same app-data root at `cache/voice` and can be removed with `opencode-remote cache clear`.

Use `opencode-remote run --state-suffix dev` to use `opencode-remote-dev.db` instead of the normal state database. The source `pnpm dev` script uses this to keep development state separate from regular gateway state.

## Runtime Internals

Background mode writes runtime files beside the selected config:

- `.opencode-remote/gateway.pid` stores the background process ID.
- `.opencode-remote/gateway.log` stores background stdout and stderr.

Login startup is user-level and project-folder scoped. `opencode-remote startup enable` creates a macOS LaunchAgent, Linux systemd user service, or Windows Scheduled Task that runs `opencode-remote start` from the current working directory at user login. `startup disable` removes the matching entry for the current config and project folder, and `startup status` reports that entry without checking unrelated projects.

On startup, the gateway checks `opencode.apiUrl`. If it is reachable, the gateway uses that server. If it is not reachable and `opencode.autoStart=true`, the gateway starts `opencode.command serve` and waits for it to become reachable before starting Telegram polling. For local `localhost` and `127.0.0.1` API URLs with a port, auto-start passes that port as `--port` so newer OpenCode CLI versions do not bind a random port. The gateway exits with an error if OpenCode is still unreachable after about 60 seconds. Before polling starts, the gateway refreshes Telegram's slash-command menu for default and private chats.

If the gateway started the OpenCode child process, it stops that child during shutdown. It does not stop an OpenCode server that was already running.

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

Run tests with coverage:

```bash
pnpm run coverage
```

Coverage uses Vitest's V8 provider over `src/**/*.js` and writes text, HTML, and LCOV reports to `coverage/`. The full local check runs coverage thresholds before the package smoke check.

Run the package smoke check:

```bash
pnpm run smoke:package
```

Run the full local check:

```bash
pnpm run check
```

`pnpm run check` runs linting, coverage thresholds, package smoke checks, and workflow smoke checks.

Default tests mock external systems. They do not require live Telegram, live OpenCode, Groq, Edge TTS, or `ffmpeg`.

## CI

GitHub Actions runs the `Check` workflow on pull requests and pushes to `main`. It installs dependencies with `pnpm install --frozen-lockfile` on Node.js 24 and runs `pnpm run check`.

Maintainers should configure branch protection for `main` to require the `Check` workflow before merging. Dependabot checks GitHub Actions and npm dependencies weekly.

## Release

Releases publish to npm from GitHub Actions using npm trusted publishing. The repository does not need an `NPM_TOKEN` secret.

Before publishing, configure a trusted publisher for `@crankshift/opencode-remote` on npmjs.com. It must match the GitHub repository and workflow filename `publish.yml`.

To publish a release:

1. Update `package.json` version and `CHANGELOG.md`.
2. Run `pnpm run check`.
3. Commit the release changes.
4. Merge or push the release commit to `main`.
5. Verify the `Create release tag` GitHub Actions workflow creates `vX.Y.Z`, matching the package version exactly.
6. Verify the `Publish to npm` GitHub Actions workflow completes and the package appears on npm.

The release tag workflow runs after successful `Check` workflow runs for pushed `main` commits. It reads `package.json`, creates the matching `vX.Y.Z` tag only if it is missing, exits without changes when that tag already points at the checked commit, and fails with a version-bump message when that tag points at a different commit. Tags created with the default GitHub Actions token do not trigger tag-push workflows, so the release tag workflow explicitly dispatches `publish.yml` at the created tag ref. The publish workflow also runs for manually pushed `v*` tags. Its `publish` job depends on a successful `check` job, validates that the ref is a tag matching `package.json` version, and then runs `npm publish --provenance --access public`. Only the publish job requests `id-token: write` for npm trusted publishing.
