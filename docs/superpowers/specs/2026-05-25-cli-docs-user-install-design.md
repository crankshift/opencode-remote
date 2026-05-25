# CLI And User Install Docs Design

## Summary

This change makes `opencode-remote` the single public CLI, focuses `README.md` on user install and usage, moves development and release material into `DEVELOPMENT.md`, and adds a small background lifecycle for the gateway.

## Goals

- Make the public install path read like an end-user tool, not a development project.
- Remove the `gateway` public binary and all `gateway run` usage from user docs.
- Keep `opencode-remote run` as the foreground command.
- Add `opencode-remote setup` for explicit interactive config creation.
- Add `opencode-remote start`, `opencode-remote stop`, and `opencode-remote status` for background use.
- Keep automatic setup behavior: `run` and `start` create config interactively when no config exists.
- Keep the implementation small and cross-platform enough for the existing Node CLI.

## Non-Goals

- Do not add launchd, systemd, Windows service, or daemon-manager integration.
- Do not add an HTTP admin server or metrics endpoint.
- Do not change Telegram bot chat commands.
- Do not change OpenCode API behavior or session routing.

## Public CLI

The package exposes only the `opencode-remote` bin. The existing `gateway` bin is removed from `package.json`, smoke tests, and documentation.

Commands:

- `opencode-remote setup`: create config interactively.
- `opencode-remote run`: run the gateway in the foreground.
- `opencode-remote start`: run the gateway in the background.
- `opencode-remote stop`: stop a background gateway started by `start`.
- `opencode-remote status`: report whether the background gateway appears to be running.

`run` and `start` both use the existing load-or-create config behavior. If no config exists, they invoke the setup flow before starting the gateway.

## Setup Behavior

`setup` uses the existing interactive prompts and writes either project-local `.opencode-remote/config.json` or global `~/.opencode-remote/config.json` based on the user's choice.

If config already exists, `setup` should avoid silently overwriting it. The minimal behavior is to tell the user where config was found and ask before replacing it. Replacement should reuse the same validation and JSON write path as first-time setup.

## Background Lifecycle

`start` launches a detached child process that runs the same CLI entry with `run`. It returns immediately after spawning and records process metadata.

Lifecycle files are stored beside the selected config, using the selected config directory:

- `gateway.pid`: numeric process ID of the detached gateway process.
- `gateway.log`: combined stdout/stderr log for the detached process.

Before starting, `start` checks the PID file. If it points to a live process, it reports that the gateway is already running and does not start another instance. If the PID is stale, it removes or replaces the stale PID file.

`stop` reads `gateway.pid`, sends `SIGTERM` to that process, and removes stale PID files when the process is already gone. It should return a clear user-facing message for not-running, stopped, and stale states.

`status` reads `gateway.pid` and reports one of these states:

- running: PID file exists and the process is alive.
- stopped: no PID file exists.
- stale: PID file exists but the process is not alive.

The PID check uses `process.kill(pid, 0)` where available. Permission errors should be treated as "exists but not controllable" and reported safely.

## Components

`src/bin/program.js` remains the commander program factory. It wires command handlers and keeps dependency injection so tests can avoid spawning real processes.

A small lifecycle helper module should own PID/log paths, live-process checks, detached spawning, and stop/status behavior. This keeps process-management details out of the commander setup.

Existing config modules should be reused rather than duplicated. If setup needs an explicit overwrite path, add the smallest option to the setup/config module instead of creating a second config writer.

## Data Flow

Foreground run:

```text
opencode-remote run
  -> loadOrCreateConfig()
  -> runGateway({ config })
```

Explicit setup:

```text
opencode-remote setup
  -> prompt for config destination and values
  -> validate config
  -> write config JSON
```

Background start:

```text
opencode-remote start
  -> loadOrCreateConfig()
  -> derive lifecycle file paths beside selected config
  -> if live PID exists, report already running
  -> spawn detached current CLI with `run`
  -> write PID file
  -> return log path and PID
```

Stop and status:

```text
opencode-remote status/stop
  -> load existing config only
  -> derive lifecycle file paths beside selected config
  -> inspect PID file
  -> report or terminate safely
```

`stop` and `status` should not auto-create config, because they are management commands and creating config would be surprising when the user only wants to inspect or stop a process.

## Error Handling

- User-facing CLI errors stay short and safe.
- Config validation errors continue to use existing safe `GatewayConfigError` messages.
- Background spawn errors should mention that the gateway could not be started and include the log path only if the child was spawned.
- PID files with invalid content should be treated as stale and safely replaced or removed depending on the command.
- `stop` should handle already-exited processes without failing noisily.

## Documentation

`README.md` becomes user-focused:

- What the tool does.
- Prerequisites.
- Installation.
- First setup.
- Foreground and background usage.
- Telegram commands.
- Config reference.
- Troubleshooting.

Development-only content moves to `DEVELOPMENT.md`:

- Dependency install.
- Running from source.
- Watch mode.
- Build.
- Smoke checks.
- Lint/test/check commands.
- Release workflow.

Public capability and release docs should be updated where command names or package bins change.

## Testing

- Update CLI program tests for `run`, `setup`, `start`, `stop`, and `status`.
- Add lifecycle helper tests for live PID, stale PID, invalid PID, spawn, stop, and status behavior.
- Update package smoke tests to expect only `opencode-remote` in `package.json` bins.
- Keep tests mocked; no live Telegram, OpenCode, or real background gateway should be required.
- Run normal verification: `pnpm run lint`, `pnpm test`, and `pnpm run check`.
