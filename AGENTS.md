# AGENTS.md

Instructions for AI agents and developers working on `opencode-remote`.

## About The Project

`opencode-remote` is a messenger-based chat interface for OpenCode, starting with Telegram.

The long-term goal is multi-messenger support: Telegram, Signal, and other chat platforms should all connect to the same OpenCode core. Telegram is the first reference adapter and should drive the first production implementation, but Telegram-specific code must not become the core architecture.

The gateway should let a user manage and use OpenCode from chat: create and switch sessions, send prompts, monitor streaming results, approve permissions, answer questions, switch models/projects where the OpenCode API supports it, and use voice input/output.

## Product Direction

- Build a Node.js gateway first.
- Implement Telegram first as the reference messenger adapter.
- Keep the OpenCode integration messenger-neutral.
- Add Signal and other messengers later by implementing adapter interfaces, not by duplicating OpenCode/session logic.
- Prefer reliable daily-use behavior over broad but fragile feature coverage.

## Technology Stack

- Language: JavaScript.
- Runtime: Node.js 24 LTS recommended. Support active LTS lines starting at Node.js 22; do not target Node.js 20.
- Package manager: pnpm.
- OpenCode integration: `@opencode-ai/sdk` and OpenCode Server API.
- Telegram integration: `grammy` and focused adapter code.
- CLI/runtime helpers: `commander` for commands and `execa` for owned `opencode serve` process management.
- Speech-to-text: Groq Whisper-compatible transcription API, default model `whisper-large-v3-turbo` unless configured otherwise.
- Text-to-speech: Microsoft Edge TTS-compatible synthesis, with voice listing and selection by locale/country code.
- Testing: Vitest for unit and integration-style tests.
- Linting and formatting: Biome. Do not add ESLint or Prettier unless there is a concrete need.
- Logging: structured project logger, never raw `console.log` in feature code.

Do not add Hono, Express, or another HTTP framework in v1. Telegram uses grammY long polling by default. Add an HTTP server only when webhooks, health checks, metrics, or an admin API are explicitly required.

Before changing OpenCode SDK, grammY, Groq, or Edge TTS integrations, fetch current docs with Context7 or the official project docs. Do not rely on memory for SDK shapes.

## Architecture

Keep the codebase split into messenger-neutral core services and messenger adapters.

Recommended structure once the project is scaffolded:

```text
src/
  core/
    opencode/       # OpenCode SDK wrapper, sessions, projects, models, permissions, SSE events
    session/        # Active gateway session state and persistence
    voice/          # STT, TTS, voice settings, voice catalog filtering
    config/         # Environment/config loading and validation
    formatting/     # Messenger-neutral response chunking and summaries
  adapters/
    telegram/       # grammY bot, commands, callbacks, Telegram media handling
    signal/         # Future Signal adapter
  runtime/          # Startup, shutdown, health checks, process lifecycle
  utils/            # Logger and small shared utilities
tests/
```

Do not introduce this exact tree all at once unless the implementation needs it. Let it emerge from the first useful features, but keep these boundaries intact.

## Core Boundaries

### OpenCode Core

The OpenCode core is the only layer that talks directly to `@opencode-ai/sdk` or OpenCode Server endpoints.

Responsibilities:

- Create, list, rename, select, and abort sessions.
- Send prompts to sessions.
- Subscribe to OpenCode SSE events.
- Track session idle/error/message/file/permission events.
- Expose project and model operations where supported by the SDK/API.
- Normalize OpenCode errors into gateway errors safe for user display.

OpenCode API concepts to preserve:

- Use `opencode serve` or an equivalent server process as the backend.
- Use `/event` or SDK event subscription for streaming state.
- Use session message/prompt APIs for user prompts.
- Use permission response APIs for approve/deny flows.
- Do not parse terminal/TUI output to infer state when SDK/API state exists.

### Gateway Session Core

Gateway session state must be messenger-neutral.

Track:

- Authorized gateway user.
- Current messenger channel/chat.
- Current OpenCode project, worktree if supported, session, model, and agent/mode if supported.
- Whether voice replies are enabled.
- Selected TTS voice.
- Blocking interaction state: pending permission, pending question, pending command confirmation, pending voice selection.

Persistent state should live in a small explicit store, such as `settings.json` or SQLite if state grows beyond simple settings. Do not persist secrets there.

### Messenger Adapters

Each messenger adapter should translate platform events into gateway events and gateway responses into platform messages.

Adapter responsibilities:

- Authenticate/authorize incoming user or chat.
- Convert text, files, voice, callbacks, and commands into normalized gateway inputs.
- Render text, buttons, files, and voice/audio responses using platform capabilities.
- Enforce platform rate limits and message length limits.
- Own platform-specific UX only.

Adapters must not directly manage OpenCode sessions or models. They call core services.

## Telegram Reference Adapter

Telegram is the first implementation and should be treated as the reference adapter.

Required Telegram capabilities:

- Private chat first. Group support is out of scope until explicitly requested.
- Single authorized user by default via Telegram user ID whitelist.
- Commands and inline buttons for session/project/model/permission flows.
- Streaming assistant replies with safe Telegram message chunking.
- File output support for long code blocks or changed files when useful.
- Voice/audio download and transcription.
- Voice reply upload when voice mode is enabled.

Telegram command surface should include at least:

```text
/status                Show OpenCode server, project, session, model, and voice status
/new                   Create a new OpenCode session
/sessions              List and switch sessions
/stop                  Abort current OpenCode task
/rename                Rename current session
/models                List and switch models when supported
/voice on              Enable spoken assistant replies
/voice off             Disable spoken assistant replies
/voice list <code>     List Edge TTS voices for a locale/country code, e.g. en, en-US, ru
/voice set <voice>     Set the Edge TTS voice short name
/help                  Show command help
```

Keep command definitions centralized. The command source should feed Telegram command registration, help text, and tests. Do not duplicate command lists.

## Voice Design

Voice is a first-class gateway feature, but it must be isolated from Telegram.

### Speech-To-Text

Voice input flow:

```text
Messenger voice/audio message
  -> adapter downloads media
  -> core voice service transcribes with Groq
  -> gateway shows recognized text
  -> OpenCode core sends recognized text as a normal prompt
```

Use Groq's Whisper-compatible transcription API or SDK. The Groq TypeScript SDK supports `client.audio.transcriptions.create({ model, file })`, including `fs.createReadStream`, `File`, `fetch` responses, or `toFile` helpers. Catch typed API errors and return safe user-facing messages.

Configuration should include:

```text
GROQ_API_KEY=
STT_MODEL=whisper-large-v3-turbo
STT_LANGUAGE=
STT_NOTE_PROMPT=
```

If STT is not configured, voice messages should get a clear setup error and must not be silently ignored.

### Text-To-Speech

Voice output flow:

```text
OpenCode assistant response
  -> gateway extracts final user-facing text
  -> core voice service synthesizes with Edge TTS
  -> adapter sends audio/voice response
```

Voice settings:

- `/voice on` enables spoken replies for final assistant responses.
- `/voice off` disables spoken replies.
- `/voice list <code>` filters voices by `Locale`, `Language`, or country prefix where the library supports it.
- `/voice set <voice>` stores the selected voice short name.
- Voice selection persists across restarts.

Before adding an Edge TTS package dependency, check its license and current API. Some Edge TTS packages use restrictive licenses. If a dependency's license is incompatible with the project, ask the user before adding it or isolate the integration behind an optional provider.

Configuration should include:

```text
TTS_PROVIDER=edge
TTS_VOICE=en-US-EmmaMultilingualNeural
TTS_RATE=+0%
TTS_VOLUME=+0%
TTS_PITCH=+0Hz
```

## Data Flow

Normal text prompt:

```text
Telegram text
  -> Telegram adapter validates user
  -> Gateway input router
  -> Session core resolves active OpenCode session
  -> OpenCode core sends prompt
  -> OpenCode SSE events
  -> Summary/formatting layer
  -> Telegram adapter updates chat
```

Permission request:

```text
OpenCode permission event
  -> OpenCode core normalizes request
  -> Gateway stores pending permission
  -> Telegram adapter renders approve/deny buttons
  -> User taps button
  -> Gateway validates callback state
  -> OpenCode core sends permission response
```

Voice prompt:

```text
Telegram voice/audio
  -> Telegram adapter downloads media
  -> Voice core transcribes with Groq
  -> Telegram adapter confirms recognized text
  -> Gateway sends transcription to OpenCode as text prompt
```

Voice response:

```text
OpenCode final assistant response
  -> Voice enabled check
  -> Voice core synthesizes Edge TTS audio
  -> Telegram adapter sends voice/audio
```

## Error Handling

- Classify errors at boundaries: config, Telegram API, OpenCode API, STT, TTS, file/media, and persistence.
- Log internal error details with enough context to debug: component, operation, session ID, chat ID if safe, and provider.
- Do not expose stack traces, tokens, filesystem secrets, or raw provider responses to the user.
- User-facing errors should say what failed and what the user can do next.
- Streaming/SSE failures should be recoverable: reconnect with backoff and preserve current session state.

## Security

- Default to single-user allowlist for Telegram: only configured user IDs can interact.
- Ignore or minimally log unauthorized users; never leak bot behavior or project state.
- Never commit `.env`, tokens, API keys, voice temp files, or OpenCode credentials.
- Store secrets only in environment variables or a dedicated secret store.
- Treat user-sent files and transcribed audio as untrusted input.
- Do not auto-approve OpenCode permissions unless the user explicitly enables that mode later.
- Redact secrets in logs and summaries.

## Configuration

Use environment variables for secrets and runtime config. Keep `.env.example` current when config is added.

Expected config surface:

```text
TELEGRAM_BOT_TOKEN=
TELEGRAM_ALLOWED_USER_ID=

OPENCODE_API_URL=http://localhost:4096
OPENCODE_COMMAND=opencode
OPENCODE_AUTO_START=true
OPENCODE_WORKDIR=
OPENCODE_MODEL_PROVIDER=
OPENCODE_MODEL_ID=

GROQ_API_KEY=
STT_MODEL=whisper-large-v3-turbo
STT_LANGUAGE=
STT_NOTE_PROMPT=

TTS_PROVIDER=edge
TTS_VOICE=en-US-EmmaMultilingualNeural
TTS_RATE=+0%
TTS_VOLUME=+0%
TTS_PITCH=+0Hz

LOG_LEVEL=info
SETTINGS_PATH=.data/settings.json
```

Validate config at startup. Fail fast for missing required secrets. For optional features like STT/TTS, start successfully but make the feature report a clear not-configured message.

## Coding Rules

- Keep code, identifiers, comments, and documentation in English.
- Keep user-facing bot text ready for localization; do not scatter hardcoded UI text through business logic.
- Prefer small functions with clear names.
- Prefer direct code over speculative abstractions.
- Add interfaces only where there are real boundaries: messenger adapter, OpenCode core, voice provider, persistence.
- Do not add backward compatibility code unless there is persisted data, shipped behavior, or an explicit requirement.
- Avoid mixing Telegram types into core service signatures.
- Avoid mixing OpenCode SDK types into adapter signatures unless they are intentionally part of a core DTO.
- Use `async/await`; avoid promise chains unless they make control flow clearer.
- Use a project logger instead of raw console calls in feature code.

## Testing

Use tests to protect the core boundaries.

Test priorities:

- Command parsing, especially `/voice` subcommands.
- Voice catalog filtering and selected voice persistence.
- STT provider behavior with mocked Groq responses and failures.
- TTS provider behavior with mocked Edge TTS responses and failures.
- OpenCode client wrapper behavior with mocked SDK calls.
- Permission and question callback state handling.
- Telegram adapter message chunking and formatting.
- Unauthorized user rejection.

Avoid tests that require live Telegram, live OpenCode, Groq, or Edge TTS by default. Put live smoke tests behind explicit environment flags.

When code exists, normal verification should be:

```bash
pnpm run lint
pnpm test
pnpm run check
```

If a script does not exist yet, add or update the script as part of scaffolding rather than documenting commands that cannot run.

## Development Workflow

1. Inspect existing code and docs before changing architecture.
2. Keep Telegram-first behavior working while extracting reusable core boundaries.
3. For new capabilities, implement core logic first, then adapter wiring.
4. Add or update tests for changed behavior.
5. Update `.env.example` and README-style docs when config or commands change.
6. Run available verification commands before claiming completion.

## Research References

The following projects informed the architecture, but do not copy their code blindly:

- `grinev/opencode-telegram-bot`: JavaScript Telegram mobile client for OpenCode with sessions, models, SSE, permissions, STT/TTS, and strong single-user UX.
- Hermes Agent gateway patterns: separate agent/session core from platform adapters, use a gateway orchestrator, isolate media handling, and keep permissions explicit.
- OpenCode SDK/API docs: sessions, prompts/messages, SSE events, permission responses, API errors.
- Groq TypeScript SDK docs: audio transcription file upload and typed API errors.
- Edge TTS package docs: voice listing/filtering and synthesis APIs, subject to license review.

## Non-Goals For The First Implementation

- Multi-user account system.
- Telegram group-first operation.
- Parallel forum-topic orchestration.
- Full CLI/TUI theming parity.
- Browser UI/dashboard.
- Scheduling and cron unless requested later.
- Signal adapter before Telegram core flows are stable.
