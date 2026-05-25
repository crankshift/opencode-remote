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
- JSON settings persistence for the active session.

Voice input, voice replies, model switching, permission callbacks, and multi-messenger support are planned but not implemented in this MVP.

See [Features](FEATURES.md) for the full current capability list, [Changelog](CHANGELOG.md) for public release notes, and [TODO](TODO.md) for planned work.

## Prerequisites

- Node.js 22 or newer. Node.js 24 LTS is recommended.
- pnpm 10.x.
- OpenCode CLI available on the machine running the gateway.
- A Telegram bot token from BotFather.
- Your Telegram numeric user ID for the allowlist.

## Setup

Install dependencies:

```bash
pnpm install
```

Create a local environment file from the example:

```bash
cp .env.example .env
```

Edit `.env` and set at least these required values:

```dotenv
TELEGRAM_BOT_TOKEN=123456:telegram-bot-token
TELEGRAM_ALLOWED_USER_ID=123456789
```

Keep `.env` private. It is ignored by git.

## Configuration

The current runtime configuration is:

```dotenv
TELEGRAM_BOT_TOKEN=
TELEGRAM_ALLOWED_USER_ID=
OPENCODE_API_URL=http://localhost:4096
OPENCODE_COMMAND=opencode
OPENCODE_AUTO_START=true
OPENCODE_WORKDIR=
OPENCODE_PROGRESS_VERBOSITY=all
LOG_LEVEL=info
SETTINGS_PATH=.data/settings.json
```

`TELEGRAM_BOT_TOKEN` is required. It is the token for the bot that receives Telegram messages.

`TELEGRAM_ALLOWED_USER_ID` is required. Updates from other Telegram users are ignored.

`OPENCODE_API_URL` is the OpenCode server URL. The default is `http://localhost:4096`.

`OPENCODE_COMMAND` is the executable used when the gateway starts OpenCode itself.

`OPENCODE_AUTO_START` controls whether the gateway runs `opencode serve` if `OPENCODE_API_URL` is not reachable. Set it to `false` if you want to manage the OpenCode server yourself.

`OPENCODE_WORKDIR` is the working directory used when auto-starting OpenCode. If empty, the gateway uses the current process directory.

`OPENCODE_PROGRESS_VERBOSITY` controls the startup default for the prompt activity message. Supported values are `off`, `new`, `all`, and `verbose`. The default is `all`, which shows every distinct tool or skill invocation. The Telegram `/progress` command can change this at runtime and persists the selected value in `SETTINGS_PATH`.

`LOG_LEVEL` controls structured log verbosity. Supported values are `fatal`, `error`, `warn`, `info`, `debug`, `trace`, and `silent`.

`SETTINGS_PATH` stores gateway state such as the selected OpenCode session. Do not store secrets there.

## Running

Start the gateway in the foreground:

```bash
pnpm start
```

Run in watch mode during development:

```bash
pnpm dev
```

You can also call the CLI entry directly:

```bash
node src/bin/gateway.js run
```

On startup, the gateway checks `OPENCODE_API_URL`. If it is reachable, the gateway uses that server. If it is not reachable and `OPENCODE_AUTO_START=true`, the gateway starts `OPENCODE_COMMAND serve` and waits for it to become reachable before starting Telegram polling.

Stop the gateway with `Ctrl+C`. If the gateway started the OpenCode child process, it stops that child during shutdown. It does not stop an OpenCode server that was already running.

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

If startup fails with a Telegram configuration error, check that `.env` contains non-empty `TELEGRAM_BOT_TOKEN` and a numeric `TELEGRAM_ALLOWED_USER_ID`.

If Telegram messages appear to be ignored, confirm that `TELEGRAM_ALLOWED_USER_ID` matches your Telegram user ID, not the bot ID or chat ID.

If startup fails because OpenCode is unreachable, either start OpenCode yourself at `OPENCODE_API_URL` or set `OPENCODE_AUTO_START=true` and make sure `OPENCODE_COMMAND` is available in `PATH`.

If auto-start fails, check `OPENCODE_WORKDIR`. The gateway starts `opencode serve` from that directory, or from the current process directory when `OPENCODE_WORKDIR` is empty.

If session selection is not preserved, check that the parent directory for `SETTINGS_PATH` is writable. The default path is `.data/settings.json`.

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
