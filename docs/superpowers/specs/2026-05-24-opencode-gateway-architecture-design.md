# OpenCode Remote Architecture Design

## Goal

Build a local-first JavaScript gateway that lets a single authorized Telegram user control OpenCode from chat. The first implementation is a text-only MVP with sessions, prompts, status, stopping active work, safe formatting, and explicit permission handling.

## Decisions

- Runtime: Node.js 24 LTS recommended, Node.js 22+ supported.
- Package manager: pnpm.
- Language: plain JavaScript using ESM modules.
- Telegram transport: grammY long polling.
- HTTP server: none in v1. Hono and webhooks are deferred until there is a concrete inbound HTTP need.
- Deployment: normal foreground Node process. No Docker requirement.
- OpenCode server: auto-start local `opencode serve` by default when the configured API URL is not reachable.
- Lint and format: Biome.
- Tests: Vitest.
- Voice: deferred to a later milestone.

## Architecture

The gateway is split into messenger-neutral core services and Telegram-specific adapter code.

```text
src/bin/gateway.js
  -> runtime/bootstrap
  -> config + logger + settings store
  -> OpenCode server manager
  -> OpenCode client wrapper
  -> gateway controller
  -> Telegram adapter using grammY polling
```

Telegram polling is an adapter implementation detail. The core gateway should not know whether Telegram updates arrived by polling, webhook, or another future messenger transport.

## Components

### CLI And Runtime

The CLI exposes `gateway run` as the v1 command. It loads configuration, initializes logging, starts or connects to OpenCode, starts Telegram polling, and handles shutdown signals. The process runs in the foreground and logs to stdout/stderr.

Background daemon commands such as `gateway start` and `gateway stop` are deferred. They add PID files, stale process cleanup, log-file management, and platform-specific lifecycle behavior that is not needed for the first stable gateway.

### Configuration

Configuration comes from environment variables and optional `.env` loading. Required Telegram secrets fail fast at startup. Optional settings use validated defaults.

V1 configuration:

```text
TELEGRAM_BOT_TOKEN=
TELEGRAM_ALLOWED_USER_ID=
OPENCODE_API_URL=http://localhost:4096
OPENCODE_COMMAND=opencode
OPENCODE_AUTO_START=true
OPENCODE_WORKDIR=
LOG_LEVEL=info
SETTINGS_PATH=.data/settings.json
```

### OpenCode Server Manager

The runtime checks whether `OPENCODE_API_URL` is reachable. If not reachable and `OPENCODE_AUTO_START=true`, it starts `OPENCODE_COMMAND serve` as a child process. The gateway waits until OpenCode responds before starting Telegram polling.

If the gateway started the child process, it terminates that child on shutdown. It must not terminate an OpenCode server that was already running before the gateway started.

### OpenCode Core

Only `src/core/opencode/` talks to `@opencode-ai/sdk` or OpenCode server endpoints. It owns session listing/creation, prompt sending, stop/abort behavior, event subscription where needed, and permission responses.

The wrapper normalizes provider/API errors into safe user-facing errors. It logs internal details but does not expose stack traces, credentials, raw provider bodies, or filesystem secrets to Telegram.

### Session Core

The session core stores messenger-neutral gateway state:

- selected OpenCode session ID
- known sessions for display
- pending permission request, when present
- future selected model/agent state

V1 persistence uses a small JSON file at `SETTINGS_PATH`. Secrets are never stored there.

### Telegram Adapter

The Telegram adapter owns grammY setup, allowlist authorization, commands, callbacks, and rendering messages/buttons. It calls the gateway controller rather than OpenCode directly.

The adapter starts with long polling via `bot.start()`. Webhook mode can be added later by replacing only adapter startup code and keeping command handlers and core services unchanged.

### Formatting

Formatting is messenger-neutral where possible. V1 provides Telegram-safe chunking below Telegram message limits and avoids splitting in the middle of obvious code/text boundaries when practical.

## V1 Command Surface

```text
/status    Show gateway, OpenCode server, active session, and config status
/new       Create and select a new OpenCode session
/sessions  List available sessions and allow selecting by callback
/stop      Abort current OpenCode task/session work when supported
/help      Show command help
```

Command definitions are centralized so bot registration, help text, and tests use the same source.

## Data Flow

### Text Prompt

```text
Telegram text
  -> Telegram adapter validates allowed user
  -> gateway controller resolves or creates active OpenCode session
  -> OpenCode core sends prompt
  -> OpenCode response/events are normalized
  -> formatter chunks response
  -> Telegram adapter sends replies
```

### Session Selection

```text
/sessions
  -> Telegram adapter requests session list
  -> gateway controller asks OpenCode core
  -> Telegram adapter renders callback buttons
  -> user taps session button
  -> gateway validates callback state
  -> session core persists selected session ID
```

### Permission Request

```text
OpenCode permission event
  -> OpenCode core normalizes request
  -> session core stores pending permission
  -> Telegram adapter renders approve/deny buttons
  -> user taps callback button
  -> OpenCode core sends permission response
  -> session core clears pending permission
```

## Error Handling

- Configuration errors fail fast with clear startup messages.
- Unauthorized Telegram users receive no project details.
- OpenCode connection failures say whether the gateway tried to auto-start OpenCode.
- OpenCode API errors are logged with structured context and shown as short safe messages.
- Telegram send/edit failures are logged and do not crash the process unless startup failed.
- Shutdown is idempotent: stop Telegram polling, then stop only the owned OpenCode child process.

## Testing

Use TDD for implementation. Test the core boundaries before adapter glue.

Priority tests:

- config validation and defaults
- command definitions and help text
- Telegram allowlist behavior
- session state and settings persistence
- formatting/chunking behavior
- OpenCode server manager using mocked process/reachability functions
- OpenCode wrapper behavior with mocked SDK/client functions
- gateway controller session resolution and prompt flow

Live Telegram, live OpenCode, Groq, and TTS tests are excluded from the default test suite.

## Deferred Work

- Hono or any HTTP server
- Telegram webhook mode
- Docker deployment
- background daemon commands
- voice input/output
- multi-user account system
- group-first Telegram support
- Signal adapter
- browser dashboard

## Self-Review Notes

This spec is intentionally scoped to a text-first local gateway. It avoids adding Hono, Docker, voice, background daemon management, and multi-platform support before the first usable Telegram/OpenCode flow is stable.
