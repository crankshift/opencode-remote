# OpenCode Remote

OpenCode Remote is a messenger-based chat interface for OpenCode, starting with Telegram.

This project is currently a text-first MVP. Telegram is the first adapter, and the core OpenCode/session logic is kept separate so other messengers can be added later.

## Current Features

- Telegram long polling with grammY.
- Single-user Telegram allowlist.
- Local OpenCode server connection with optional auto-start.
- OpenCode session creation, listing, selection, prompt sending, and stop requests.
- Telegram-safe response chunking for long replies.
- Telegram typing indicators while prompts are running.
- Telegram emoji reactions for processing state, user feedback, and assistant-requested reactions.
- Telegram photo and photo-album prompts.
- Interactive JSON config setup for the published CLI.
- JSON settings persistence for the active session.

Voice input, voice replies, model switching, permission callbacks, and multi-messenger support are planned but not implemented in this MVP.

See [Features](https://github.com/crankshift/opencode-remote/blob/main/FEATURES.md) for the full current capability list, [Changelog](https://github.com/crankshift/opencode-remote/blob/main/CHANGELOG.md) for public release notes, and [TODO](https://github.com/crankshift/opencode-remote/blob/main/TODO.md) for planned work.

## Prerequisites

- Node.js 22.18.0 or newer. Node.js 24 LTS is recommended.
- OpenCode CLI available on the machine running the gateway.
- A Telegram bot token from BotFather.
- Your Telegram numeric user ID for the allowlist.

## Install

Install globally with npm:

```bash
npm install -g @crankshift/opencode-remote
```

Or with pnpm:

```bash
pnpm add -g @crankshift/opencode-remote
```

The package installs two equivalent CLI bins: `gateway` and `opencode-remote`.

## First Run

Start the gateway:

```bash
gateway run
```

If no config exists, the CLI prompts to create one. It asks whether to write a project-local or global config, then prompts for the Telegram token, allowed Telegram user ID, OpenCode connection settings, progress verbosity, log level, and settings path.

Config discovery order:

1. Project-local `./.opencode-remote/config.json` in the current working directory.
2. Global `~/.opencode-remote/config.json`.

Local project config is useful when different projects need different OpenCode workdirs or Telegram bots. Global config is useful for one machine-wide gateway setup.

## Configuration

The config file is JSON:

```json
{
  "telegram": {
    "botToken": "123456:telegram-bot-token",
    "allowedUserId": 123456789
  },
  "opencode": {
    "apiUrl": "http://localhost:4096",
    "command": "opencode",
    "autoStart": true,
    "workdir": null
  },
  "progressVerbosity": "all",
  "logLevel": "info"
}
```

`telegram.botToken` is required. It is the token for the bot that receives Telegram messages.

`telegram.allowedUserId` is required. Updates from other Telegram users are ignored.

`opencode.apiUrl` is the OpenCode server URL. The default is `http://localhost:4096`.

`opencode.command` is the executable used when the gateway starts OpenCode itself. The default is `opencode`.

`opencode.autoStart` controls whether the gateway runs `opencode serve` if `opencode.apiUrl` is not reachable. Set it to `false` if you want to manage the OpenCode server yourself.

`opencode.workdir` is the working directory used when auto-starting OpenCode. If omitted or `null`, the gateway uses the current process directory.

`progressVerbosity` controls the startup default for the prompt activity message. Supported values are `off`, `new`, `all`, and `verbose`. The default is `all`, which shows every distinct tool or skill invocation. The Telegram `/progress` command can change this at runtime and persists the selected value in the settings file.

`logLevel` controls structured log verbosity. Supported values are `fatal`, `error`, `warn`, `info`, `debug`, `trace`, and `silent`.

`settingsPath` is optional. If omitted, gateway state is stored beside the selected config as `.opencode-remote/settings.json`. Do not store secrets in the settings file.

Keep `config.json` private because it contains your Telegram bot token. Project-local `.opencode-remote/` is ignored by git.

## Running

Run the installed CLI:

```bash
gateway run
```

You can also run the equivalent bin:

```bash
opencode-remote run
```

On startup, the gateway checks `opencode.apiUrl`. If it is reachable, the gateway uses that server. If it is not reachable and `opencode.autoStart=true`, the gateway starts `opencode.command serve` and waits for it to become reachable before starting Telegram polling. Before polling starts, the gateway refreshes Telegram's slash-command menu for default and private chats.

Stop the gateway with `Ctrl+C`. If the gateway started the OpenCode child process, it stops that child during shutdown. It does not stop an OpenCode server that was already running.

## Development

Install dependencies:

```bash
pnpm install
```

Start from source:

```bash
pnpm start
```

Run in watch mode during development:

```bash
pnpm dev
```

Build the publishable package output:

```bash
pnpm run build
```

Run the package smoke check:

```bash
pnpm run smoke:package
```

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

## Telegram Commands

The bot currently supports:

```text
/status    Show gateway and active session status
/new       Create and select a new OpenCode session
/sessions  List OpenCode sessions and select one with inline buttons
/stop      Request stop for the active OpenCode session
/progress  Show or set tool progress visibility: off, new, all, verbose
/help      Show available commands
```

Any non-command text message from the authorized Telegram user is sent to OpenCode as a prompt. If no active session is selected, the gateway creates one automatically.

Telegram photo albums are handled as one OpenCode prompt when Telegram provides a shared `media_group_id`. The album caption becomes the prompt text. Separate text messages sent after an album are treated as separate prompts.

## Troubleshooting

If startup fails with a configuration error, check the selected `.opencode-remote/config.json` and make sure `telegram.botToken` is non-empty and `telegram.allowedUserId` is numeric.

If Telegram messages appear to be ignored, confirm that `telegram.allowedUserId` matches your Telegram user ID, not the bot ID or chat ID.

If startup fails because OpenCode is unreachable, either start OpenCode yourself at `opencode.apiUrl` or set `opencode.autoStart=true` and make sure `opencode.command` is available in `PATH`.

If auto-start fails, check `opencode.workdir`. The gateway starts `opencode serve` from that directory, or from the current process directory when `opencode.workdir` is empty.

If session selection is not preserved, check that the parent directory for the settings file is writable. The default path is `.opencode-remote/settings.json` beside the selected config.

## Development Checks

Run linting:

```bash
pnpm run lint
```

Run tests:

```bash
pnpm test
```

Run the full local check:

```bash
pnpm run check
```

Default tests mock external systems. They do not require live Telegram, live OpenCode, Groq, or TTS services.
