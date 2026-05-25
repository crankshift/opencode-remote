# AGENTS.md

AI operating guide for `opencode-remote`. Keep this file compact and current: it should give future agents maximum useful context with minimum reading.

## Project Snapshot

- Package: `@crankshift/opencode-remote`, CLI bins `opencode-remote` and `gateway`.
- Product: local-first messenger gateway for OpenCode. Telegram is the first adapter.
- Current state: text-first Telegram MVP with sessions, prompts, stop, typing indicators, emoji reactions, image prompts, and active-session persistence.
- Direction: keep OpenCode/session logic messenger-neutral so Signal or other messengers can reuse the core later.
- Runtime: Node.js `>=22`; Node.js 24 LTS recommended.
- Package manager: pnpm.
- Language: JavaScript ESM.
- Tests: Vitest.
- Lint/format: Biome. Do not add ESLint or Prettier without a concrete need.
- Logging: use project logger in feature code. Avoid raw `console.*` except CLI boundary startup/error reporting.

## Recent Context From OpenCode Sessions

Local OpenCode session history for this repo shows recent work on public release docs, package publishing prep, image/photo prompts, emoji reactions, Telegram typing indicators, coverage TODOs, large-file split TODOs, and Signal architecture planning. Treat these as context, not source of truth; verify current behavior in source/tests.

## Current Implementation

Implemented now:

- Telegram long polling via grammY.
- Single authorized Telegram user using `TELEGRAM_ALLOWED_USER_ID`.
- OpenCode server reachability check and optional local `opencode serve` auto-start.
- OpenCode session create/list/select, prompt sending, and active-session abort.
- Auto-create an OpenCode session before the first prompt when no active session is selected.
- JSON settings persistence for `activeSessionId` at `SETTINGS_PATH`.
- Telegram-safe text chunking below message limits.
- Telegram typing action while prompts are running.
- Temporary eye reaction on incoming text prompts while OpenCode processes.
- Hidden assistant reaction marker parsing: `[telegram_reaction: 👍]` is stripped from replies and applied to the original user message best-effort.
- User reactions to recent bot messages become normal OpenCode feedback prompts.
- Bounded in-memory bot-message memory, currently 200 entries.
- Telegram single-photo and photo-album prompts. Albums are grouped by `media_group_id` with a short debounce.
- Telegram photos are downloaded to temp files, sent as OpenCode file prompt parts, then cleaned up.
- Public docs exist: `README.md`, `FEATURES.md`, `CHANGELOG.md`, `TODO.md`, `LICENSE`.

Not implemented yet:

- Voice input, STT, TTS, voice selection, or voice reply upload.
- Model/provider switching from Telegram.
- Permission approval callbacks.
- OpenCode project/worktree switching from Telegram.
- Signal or other messenger adapters.
- Telegram webhooks, HTTP admin server, health checks, metrics, or browser UI.
- Multi-user accounts, group-first operation, scheduled tasks, MCP/skills command browsing.

Do not describe planned items as shipped. If you implement one, update this file, `README.md`/`FEATURES.md`, tests, and `.env.example` if config changes.

## Architecture Map

```text
src/bin/gateway.js                 CLI entry, commander command `gateway run`
src/runtime/bootstrap.js           runtime wiring, shutdown, Telegram polling startup
src/config/loadConfig.js           dotenv + zod env validation
src/utils/logger.js                pino logger factory
src/core/commands/commands.js      centralized Telegram command definitions/help text
src/core/formatting/chunkText.js   messenger-neutral reply chunking
src/core/session/settingsStore.js  JSON settings persistence
src/core/gateway/controller.js     messenger-neutral orchestration
src/core/opencode/serverManager.js OpenCode reachability and owned child lifecycle
src/core/opencode/client.js        only layer that talks to `@opencode-ai/sdk`
src/adapters/telegram/auth.js      Telegram allowlist checks
src/adapters/telegram/bot.js       grammY bot, commands, callbacks, reactions, photos
src/adapters/telegram/media.js     Telegram photo download/caption/cleanup helpers
src/adapters/telegram/mediaGroupBuffer.js photo-album debounce/grouping
tests/                             Vitest tests with mocked Telegram/OpenCode by default
```

Keep this split intact. Add modules only when they reduce real complexity; prefer the smallest correct change.

## Core Boundaries

- `src/core/opencode/` is the only code that should call `@opencode-ai/sdk` or raw OpenCode API endpoints.
- `src/core/gateway/controller.js` owns messenger-neutral session/prompt orchestration.
- `src/core/session/` stores messenger-neutral gateway state only. Never persist secrets.
- `src/adapters/telegram/` owns grammY types, Telegram IDs, callbacks, reactions, media downloads, and platform UX.
- Do not leak Telegram types into core service signatures.
- Do not leak SDK-specific response shapes into adapters unless wrapped by core DTOs.
- Command definitions must stay centralized in `src/core/commands/commands.js`; bot registration, help text, and tests should use that source.
- Use `async/await`; avoid promise chains unless they make control flow clearer.
- User-facing errors must be safe: no stack traces, tokens, filesystem secrets, raw provider bodies, or credentials.
- External API failures at adapter boundaries should log structured context and return short safe user messages.

## Telegram Commands

Implemented command surface:

```text
/status    Show gateway and active session status
/new       Create and select a new OpenCode session
/sessions  List OpenCode sessions and switch with inline buttons
/stop      Request abort for the active OpenCode session
/help      Show available commands
```

Do not add duplicate command lists. Update `botCommands`, tests, README/docs, and Telegram registration behavior together.

## Data Flows

Text prompt:

```text
Telegram text
  -> allowlist middleware
  -> adapter applies typing + temporary eye reaction
  -> controller resolves or creates active session
  -> OpenCode client sends prompt parts
  -> adapter strips hidden reaction marker
  -> chunkText
  -> Telegram replies + optional final emoji reaction
```

Session selection:

```text
/sessions
  -> controller.listSessions()
  -> adapter renders inline buttons with bounded callback tokens
  -> callback resolves token to session ID
  -> controller.selectSession()
  -> settingsStore writes activeSessionId
```

Photo or album prompt:

```text
Telegram photo(s)
  -> adapter selects largest photo sizes
  -> mediaGroupBuffer groups albums by chat + media_group_id
  -> adapter downloads temp files
  -> controller.sendPrompt({ text, attachments })
  -> OpenCode file parts before text part
  -> adapter chunks response
  -> cleanup temp files in finally
```

Reaction feedback:

```text
User reacts to recent bot message
  -> message_reaction update
  -> adapter finds stored bot message by chatId:messageId
  -> adapter sends feedback prompt to OpenCode
  -> response is chunked and remembered like normal bot output
```

Startup/shutdown:

```text
gateway run
  -> load config
  -> ensure OpenCode server reachable or auto-start owned child
  -> create SDK client, settings store, controller, Telegram bot
  -> bot.start({ allowed_updates: ["message", "callback_query", "message_reaction"] })
  -> SIGINT/SIGTERM stops Telegram and only the owned OpenCode child
```

## Current Configuration

`.env.example` is the source of current runtime config:

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

Rules:

- `TELEGRAM_BOT_TOKEN` and `TELEGRAM_ALLOWED_USER_ID` are required.
- `OPENCODE_AUTO_START=true` starts `OPENCODE_COMMAND serve` only when `OPENCODE_API_URL` is unreachable.
- If the gateway starts OpenCode, it owns and stops that child on shutdown. It must not stop a server that was already running.
- `SETTINGS_PATH` stores non-secret JSON state only.
- Do not add voice, model, or provider env vars until the related feature is actually implemented.

## OpenCode Integration Notes

- Current SDK client uses `createOpencodeClient({ baseUrl: apiUrl, responseStyle: "data", throwOnError: true })`.
- Text prompts are sent as `{ parts: [{ type: "text", text }] }`.
- Attachments are sent before text as `{ type: "file", mime, url }` prompt parts.
- Responses are normalized to visible text from text parts, with fallback `OpenCode returned no text response.`.
- Wrap OpenCode failures in safe `GatewayOpenCodeError` messages.
- Before changing SDK shapes, permissions, models, projects, events, or SSE behavior, fetch current OpenCode SDK/API docs with Context7 or official docs.

## Telegram Adapter Notes

- Authorization middleware should ignore unauthorized users and avoid leaking project state.
- Reaction API calls are best-effort warnings. They must not block prompt delivery.
- `replyAndRemember` stores bot replies for reaction feedback. Use it for bot messages that should be remembered.
- Session inline callback data uses short tokens, not raw long session IDs.
- Photo downloads must not expose bot tokens in persisted attachment URLs.
- Always clean up downloaded media files in `finally` or equivalent cleanup paths.
- Keep Telegram UX in the adapter; do not move Telegram reactions, message IDs, or chat actions into core.

## Docs And Packaging

- README is the public quick start.
- `FEATURES.md` is the public current-capability inventory.
- `CHANGELOG.md` is public release history.
- `TODO.md` is the roadmap/backlog.
- `AGENTS.md` is for AI/developer operating context, not marketing copy.
- Package metadata currently targets public publishing, but check `TODO.md` before assuming npm release readiness is complete.
- If behavior changes, update docs in the same task when useful to users or future agents.

## Testing

Normal verification:

```bash
pnpm run lint
pnpm test
pnpm run check
```

Default tests must not require live Telegram, live OpenCode, Groq, Edge TTS, or other paid/network services.

Current test priorities:

- Config validation and defaults.
- Central command definitions and help rendering.
- Telegram allowlist rejection.
- OpenCode server manager reachability/auto-start behavior.
- OpenCode client prompt shape, file attachments, and response unwrapping.
- Gateway controller session creation, selection, prompt routing, and stop behavior.
- Settings persistence.
- Telegram text prompt typing/reaction behavior.
- Hidden Telegram reaction marker stripping.
- User reaction feedback prompts.
- Photo download, caption fallback, album grouping, and cleanup.
- Chunking behavior for long replies.
- Runtime startup `allowed_updates`.

## Development Workflow

1. Inspect current code/tests/docs before changing behavior.
2. Keep changes minimal and aligned with existing boundaries.
3. Add or update tests for behavior changes. Docs-only changes usually do not need new tests.
4. Update `.env.example` when config changes.
5. Update README/FEATURES/CHANGELOG/TODO when public behavior, release notes, or roadmap change.
6. Run available verification before claiming completion.

## Roadmap Guardrails

- Do not add Hono, Express, or another HTTP framework unless webhooks, health checks, metrics, or admin APIs are explicitly requested.
- Voice should stay isolated behind core voice/provider boundaries when implemented.
- Signal should be added as an adapter, not by duplicating OpenCode/session logic.
- Permission approvals must stay explicit; never auto-approve OpenCode permissions by default.
- Multi-user support, group-first Telegram behavior, scheduled tasks, MCP browsing, and OpenCode skills browsing are future work unless the user explicitly asks for them.
