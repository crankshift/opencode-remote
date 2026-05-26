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

`pnpm setup` executes `src/bin/opencode-remote.js setup` and replaces any existing gateway config. `pnpm start` executes `src/bin/opencode-remote.js run` and uses the normal app-state database. `pnpm dev` runs the same gateway in watch mode with `--state-suffix dev`, so development state is stored in `opencode-remote-dev.db` instead of the production `opencode-remote.db`. If no config exists, `pnpm dev` starts the same interactive setup flow before starting the gateway.

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

On startup, the gateway checks `opencode.apiUrl`. If it is reachable, the gateway uses that server. If it is not reachable and `opencode.autoStart=true`, the gateway starts `opencode.command serve` and waits for it to become reachable before starting Telegram polling. Before polling starts, the gateway refreshes Telegram's slash-command menu for default and private chats.

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

Run the package smoke check:

```bash
pnpm run smoke:package
```

Run the full local check:

```bash
pnpm run check
```

Default tests mock external systems. They do not require live Telegram, live OpenCode, Groq, Edge TTS, or `ffmpeg`.

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
