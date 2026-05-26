# AGENTS.md

AI operating guide for `opencode-remote`. Keep this file compact and current: it should give future agents maximum useful context with minimum reading.

## Project Snapshot

- Package: `@crankshift/opencode-remote`, CLI bin `opencode-remote`.
- Product: local-first messenger gateway for OpenCode. Telegram is the first adapter.
- Current state: Telegram MVP with sessions, prompts, stop, typing indicators, emoji reactions, image prompts, opt-in voice mode, and active-session persistence.
- Direction: keep OpenCode/session logic messenger-neutral so Signal or other messengers can reuse the core later.
- Runtime: Node.js `>=22.18.0`; Node.js 24 LTS recommended.
- Package manager: pnpm 11.3.0.
- Language: JavaScript ESM.
- Tests: Vitest.
- Lint/format: Biome. Do not add ESLint or Prettier without a concrete need.
- Logging: use project logger in feature code. Avoid raw `console.*` except CLI boundary startup/error reporting.

## Recent Context From OpenCode Sessions

Local OpenCode session history for this repo shows recent work on public release docs, package publishing prep, image/photo prompts, emoji reactions, Telegram typing indicators, coverage TODOs, large-file split TODOs, and Signal architecture planning. Treat these as context, not source of truth; verify current behavior in source/tests.

## Current Implementation

Implemented now:

- Telegram long polling via grammY.
- Single authorized Telegram user configured in `.opencode-remote/config.json`.
- OpenCode server reachability check and optional local `opencode serve` auto-start.
- OpenCode session create/list/select, prompt sending, and active-session abort.
- Auto-create an OpenCode session before the first prompt when no active session is selected.
- JSON config discovery from project-local `.opencode-remote/config.json`, then global `~/.opencode-remote/config.json`.
- Interactive CLI config setup when no JSON config exists, with selected-scope current defaults, highlighted arrow-key lists for choice prompts, and `ffmpeg` install/retry handling for voice setup.
- SQLite app-state persistence for `activeSessionId` and `/progress` preference in the platform app-data directory, scoped by OpenCode-style project identity.
- Telegram-safe text chunking below message limits.
- Telegram typing action while prompts are running.
- Temporary eye reaction on incoming text prompts while OpenCode processes.
- Hidden assistant reaction marker parsing: `[telegram_reaction: 👍]` is stripped from replies and applied to the original user message best-effort.
- User reactions to recent bot messages become normal OpenCode feedback prompts.
- Bounded in-memory bot-message memory, currently 200 entries.
- Telegram single-photo and photo-album prompts. Albums are grouped by `media_group_id` with a short debounce.
- Telegram photos are downloaded to temp files, sent as OpenCode file prompt parts, then cleaned up.
- Optional Telegram voice mode with Groq Whisper transcription, Edge TTS replies, and `ffmpeg` MP3-to-OGG/Opus conversion for Telegram voice notes.
- `/voice` command for status, on/off/all modes, paged voice listing, voice selection, and test voice notes.
- CLI `opencode-remote config set` for individual JSON config keys and `opencode-remote cache clear` for generated voice files.
- Publishable npm package output is built to `dist/` with `tsdown`.
- Public CLI bin is `opencode-remote`.
- Background CLI lifecycle supports `opencode-remote start`, `opencode-remote stop`, and `opencode-remote status`.
- Source watch mode `pnpm dev` runs with `--state-suffix dev`, so development state uses `opencode-remote-dev.db` instead of the normal app-state database.
- Public docs exist: `README.md`, `FEATURES.md`, `CHANGELOG.md`, `TODO.md`, `LICENSE`.

Not implemented yet:

- Model/provider switching from Telegram.
- Permission approval callbacks.
- OpenCode project/worktree switching from Telegram.
- Signal or other messenger adapters.
- Telegram webhooks, HTTP admin server, health checks, metrics, or browser UI.
- Multi-user accounts, group-first operation, scheduled tasks, MCP/skills command browsing.

Do not describe planned items as shipped. If you implement one, update this file, `README.md`/`FEATURES.md`, tests, and config docs if config changes.

## Architecture Map

```text
src/bin/opencode-remote.js         CLI entry
src/bin/program.js                 commander commands for `opencode-remote`
src/runtime/bootstrap.js           runtime wiring, shutdown, Telegram polling startup
src/runtime/background.js          background PID/log lifecycle helpers
src/config/loadConfig.js           JSON config discovery + zod validation
src/config/setupConfig.js          interactive config creation flow
src/utils/logger.js                pino logger factory
src/core/commands/commands.js      centralized Telegram command definitions/help text
src/core/formatting/chunkText.js   messenger-neutral reply chunking
src/core/state/appDataPath.js      platform app-data path resolution
src/core/state/projectIdentity.js  Git-aware project identity resolution
src/core/state/stateDb.js          SQLite app-state persistence
src/core/voice/                    voice mode orchestration, STT/TTS wrappers, ffmpeg conversion, cache helpers
src/core/gateway/controller.js     messenger-neutral orchestration
src/core/opencode/serverManager.js OpenCode reachability and owned child lifecycle
src/core/opencode/client.js        only layer that talks to `@opencode-ai/sdk`
src/adapters/telegram/auth.js      Telegram allowlist checks
src/adapters/telegram/bot.js       grammY bot, commands, callbacks, reactions, photos
src/adapters/telegram/media.js     Telegram photo download/caption/cleanup helpers
src/adapters/telegram/mediaGroupBuffer.js photo-album debounce/grouping
src/adapters/telegram/voice.js     Telegram voice download/send helpers
tests/                             Vitest tests with mocked Telegram/OpenCode by default
```

Keep this split intact. Add modules only when they reduce real complexity; prefer the smallest correct change.

## Core Boundaries

- `src/core/opencode/` is the only code that should call `@opencode-ai/sdk` or raw OpenCode API endpoints.
- `src/core/gateway/controller.js` owns messenger-neutral session/prompt orchestration.
- `src/core/state/` stores messenger-neutral gateway state only. Never persist secrets.
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
/progress  Show or set tool progress visibility: off, new, all, verbose
/voice     Show or set voice mode
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
  -> project state store writes activeSessionId
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

Voice prompt:

```text
Telegram voice
  -> adapter downloads temp OGG/voice file
  -> core voice service transcribes with Groq Whisper
  -> controller sends transcript as an OpenCode text prompt
  -> adapter sends text reply
  -> if /voice on or all applies, Edge TTS creates MP3
  -> ffmpeg converts MP3 to OGG/Opus
  -> adapter sends Telegram voice note
  -> cleanup downloaded input file; generated reply remains cache
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
opencode-remote run
  -> load or create JSON config
  -> ensure OpenCode server reachable or auto-start owned child
  -> resolve project identity, create SDK client, create project state store, controller, Telegram bot
  -> bot.start({ allowed_updates: ["message", "callback_query", "message_reaction"] })
  -> SIGINT/SIGTERM stops Telegram and only the owned OpenCode child
```

## Current Configuration

Runtime config is discovered in this order:

1. Project-local `.opencode-remote/config.json` in the current working directory.
2. Global `~/.opencode-remote/config.json`.

If no config exists, `opencode-remote run` and `opencode-remote start` prompt the CLI user to create one locally or globally.

Current config shape:

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
  "voice": {
    "enabled": false,
    "mode": "on",
    "voice": "en-US-AndrewNeural",
    "groqApiKey": null,
    "sttModel": "whisper-large-v3-turbo"
  },
  "progressVerbosity": "verbose",
  "logLevel": "info"
}
```

Rules:

- `telegram.botToken` and `telegram.allowedUserId` are required.
- `opencode.autoStart=true` starts `opencode.command serve` only when `opencode.apiUrl` is unreachable.
- If the gateway starts OpenCode, it owns and stops that child on shutdown. It must not stop a server that was already running.
- App state is stored in `opencode-remote.db` under the platform app-data directory: `$XDG_DATA_HOME/opencode-remote` or `~/.local/share/opencode-remote` on Linux, `~/Library/Application Support/opencode-remote` on macOS, and `%LOCALAPPDATA%\opencode-remote` on Windows.
- Project state uses OpenCode-style identity: Git remote hash, then cached repo ID, then root commit; non-Git folders use the shared `global` identity.
- `settingsPath` may still validate for old configs but is not used by the runtime state store.
- Background runtime files are stored beside the selected config as `.opencode-remote/gateway.pid` and `.opencode-remote/gateway.log` by default.
- Voice mode is disabled by default. If enabled, startup requires `ffmpeg`; setup can offer a detected package-manager install and otherwise waits while the user installs `ffmpeg` in another terminal.
- `voice.groqApiKey` is required for live voice transcription and must stay in private config.
- Generated voice files are cache under the app-data `cache/voice` directory and are removable with `opencode-remote cache clear`.
- Project-local `.opencode-remote/` is ignored because `config.json` contains secrets.
- Do not add model or provider env vars until the related feature is actually implemented.

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

- README is the public install and usage guide.
- `DEVELOPMENT.md` contains source, test, build, and release workflow notes.
- `FEATURES.md` is the public current-capability inventory.
- `CHANGELOG.md` is public release history.
- `TODO.md` is the roadmap/backlog.
- `AGENTS.md` is for AI/developer operating context, not marketing copy.
- Package metadata targets public npm publishing. `tsdown` builds `dist/`; package smoke checks validate bins, exports, and pack contents.
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
- SQLite app-state persistence and project identity resolution.
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
4. Update README/FEATURES/AGENTS config docs when config changes.
5. Update README/FEATURES/CHANGELOG/TODO when public behavior, release notes, or roadmap change.
6. Run available verification before claiming completion.

## Roadmap Guardrails

- Do not add Hono, Express, or another HTTP framework unless webhooks, health checks, metrics, or admin APIs are explicitly requested.
- Voice stays isolated behind core voice/provider boundaries; keep Groq, Edge TTS, and ffmpeg details out of Telegram command wiring.
- Signal should be added as an adapter, not by duplicating OpenCode/session logic.
- Permission approvals must stay explicit; never auto-approve OpenCode permissions by default.
- Multi-user support, group-first Telegram behavior, scheduled tasks, MCP browsing, and OpenCode skills browsing are future work unless the user explicitly asks for them.
