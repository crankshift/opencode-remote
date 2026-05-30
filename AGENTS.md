# AGENTS.md

AI operating guide for `opencode-remote`. Keep this file short: preserve critical context here and point to source/docs for details that can drift.

## First Reads

- Current user-facing features: `FEATURES.md`.
- Install, setup, config, and usage: `README.md`.
- External contributor guidance: `CONTRIBUTING.md`.
- Development, app state, build, checks, and release workflow: `DEVELOPMENT.md`.
- Roadmap and backlog: `TODO.md`.
- Historical specs and implementation plans: `docs/superpowers/`.
- Always verify current behavior in source and tests before changing code. Docs and local session history can be stale.

## Project Snapshot

- Package: `@crankshift/opencode-remote`, CLI bin `opencode-remote`.
- Product: local-first messenger gateway for OpenCode. Telegram is the first and only shipped adapter today.
- Direction: keep OpenCode/session logic messenger-neutral so Signal or other messengers can reuse the core later.
- Runtime: Node.js `>=22.18.0`; Node.js 24 LTS recommended.
- Package manager: pnpm 11.3.0.
- Never add `minimumReleaseAgeExclude` to pnpm config; it bypasses pnpm's release-age supply-chain guardrail.
- Language: JavaScript ESM.
- Tests: Vitest.
- Lint/format: Biome. Do not add ESLint or Prettier without a concrete need.
- Logging: use the project logger in feature code. Avoid raw `console.*` except CLI boundary startup/error reporting. New feature behavior should include safe structured debug logs when it has meaningful runtime decisions, external calls, cleanup, or failure modes.

## Open Source And Privacy

- This is an open source project. Treat the repository, issues, pull requests, and GitHub Project board content as public unless the user explicitly says otherwise.
- Never publish secrets, credentials, tokens, Telegram IDs, private user data, raw provider bodies, stack traces with sensitive context, or machine-specific local paths.
- When documenting paths, use generic examples such as `/path/to/project`, `~/.opencode-remote/config.json`, `$XDG_DATA_HOME/opencode-remote`, or `%LOCALAPPDATA%\opencode-remote`; avoid real usernames, home directories, app-data paths, or OS-specific details from this machine.
- Keep GitHub Project task descriptions sanitized and high-level. Ask before posting debugging details that might reveal local environment, private configuration, or user data.

## Architecture Boundaries

- `src/core/opencode/` is the only code that should call `@opencode-ai/sdk` or raw OpenCode API endpoints.
- `src/core/gateway/controller.js` owns messenger-neutral session and prompt orchestration.
- `src/core/state/` stores messenger-neutral gateway state only. Never persist secrets.
- `src/core/voice/` owns voice orchestration and provider wrappers. Keep Groq, Edge TTS, and `ffmpeg` details out of Telegram command wiring.
- `src/adapters/telegram/` owns grammY types, Telegram IDs, callbacks, reactions, media downloads, and platform UX.
- Telegram command menu UX rules live in `docs/adapters/telegram/commands/MENU.md`; read it before changing command menus or callback flows.
- Do not leak Telegram types into core service signatures.
- Do not leak SDK-specific response shapes into adapters unless wrapped by core DTOs.
- Command definitions must stay centralized in `src/core/commands/commands.js`; bot registration, help text, docs, and tests should use that source.

## Source Map

```text
src/bin/                         CLI entry and commander program
src/runtime/                     runtime wiring, background lifecycle, login startup
src/config/                      JSON config discovery, validation, interactive setup
src/utils/logger.js              pino logger factory
src/core/commands/commands.js    centralized Telegram command definitions/help text
src/core/formatting/             messenger-neutral reply formatting
src/core/state/                  app-data path, project identity, SQLite state
src/core/voice/                  STT/TTS orchestration, ffmpeg conversion, cache helpers
src/core/gateway/controller.js   messenger-neutral gateway controller
src/core/opencode/               OpenCode client and server manager
src/adapters/telegram/           grammY adapter, auth, media, albums, voice
src/adapters/telegram/stickers*  Telegram sticker download, cache, store, rendering helpers
tests/                           Vitest tests with mocked external services by default
```

Add modules only when they reduce real complexity. Prefer the smallest correct change.

## OpenCode Integration

- Current SDK client is created with `createOpencodeClient({ baseUrl: apiUrl, responseStyle: "data", throwOnError: true })`.
- Text prompts use OpenCode text parts; media attachments are sent before text as file parts.
- Permission events are normalized from `permission.updated`; responses use OpenCode's session permission response API with `accept` or `deny` and optional `remember`.
- Wrap OpenCode failures in safe `GatewayOpenCodeError` messages.
- Before changing SDK shapes, permissions, models, projects, events, or SSE behavior, fetch current OpenCode SDK/API docs with Context7 or official docs.

## Telegram Adapter

- Authorization middleware should ignore unauthorized users and avoid leaking project state.
- Group routing, known group metadata, DM configuration menus, and ephemeral group memory belong in `src/adapters/telegram/`; do not move Telegram chat IDs, topics, or inline menus into core.
- Telegram command menus should use the hybrid pattern from `docs/adapters/telegram/commands/MENU.md`: bare commands open understandable menus, direct commands keep working, complex settings use grouped submenus, and free-text input is explicit/cancellable.
- Reaction API calls are best-effort warnings and must not block prompt delivery.
- `replyAndRemember` stores bot replies for reaction feedback. Use it for bot messages that should be remembered.
- Inline callback data must use short bounded tokens, not raw long session IDs or permission IDs.
- Permission prompts must remain text-only, even when voice replies are enabled.
- Photo downloads must not expose bot tokens in persisted attachment URLs.
- Sticker cache and saved pack state must not persist bot tokens, raw download URLs, chat IDs, user IDs, or raw Telegram payloads.
- Group message memory is in-memory only and must not persist message text. Persistent group state may store settings and non-secret group metadata.
- Always clean up downloaded media files in `finally` or equivalent cleanup paths.
- Keep Telegram UX in the adapter; do not move Telegram reactions, message IDs, chat actions, or grammY types into core.

## Config And State

- Runtime config is discovered from project-local `.opencode-remote/config.json`, then global `~/.opencode-remote/config.json`.
- `telegram.botToken` is required and must stay private.
- At least one of `telegram.allowedUserIds` or `telegram.allowedChatIds` is required. `allowedUserIds` authorizes private human DMs; `allowedChatIds` authorizes every sender in those group chats, including bots.
- Project-local `.opencode-remote/` is ignored because `config.json` contains secrets.
- App state is non-secret SQLite data in the platform app-data directory; see `DEVELOPMENT.md` for exact paths.
- Telegram sticker pack state is non-secret adapter state in `telegram-stickers.db`; reusable visuals are disposable cache under `cache/stickers`.
- Project state uses OpenCode-style identity: Git remote hash, then cached repo ID, then root commit; non-Git folders use the shared `global` identity.
- Do not add model or provider env vars until the related feature is actually implemented.

## Runtime Rules

- `opencode.autoStart=true` starts `opencode.command serve` only when `opencode.apiUrl` is unreachable.
- If the gateway starts OpenCode, it owns and stops only that child on shutdown. It must not stop a server that was already running.
- Background runtime files live beside the selected config as `.opencode-remote/gateway.pid` and `.opencode-remote/gateway.log` by default.
- Login startup is user-level and project-folder scoped: macOS LaunchAgents, Linux systemd user services, and Windows Scheduled Tasks run `opencode-remote start` from the selected project folder.

## Testing

Normal verification:

```bash
pnpm run lint
pnpm test
pnpm run check
```

- Default tests must not require live Telegram, live OpenCode, Groq, Edge TTS, `ffmpeg`, or other paid/network services.
- Add or update focused tests for behavior changes.
- Docs-only changes usually do not need new tests, but still run cheap verification when practical.

## Docs And Packaging

- `README.md` is the public install and usage guide.
- `CONTRIBUTING.md` is the public guide for external contributors; keep it focused on contribution expectations and link to `DEVELOPMENT.md` for local workflow details.
- `DEVELOPMENT.md` contains source, test, build, app-state, runtime, and release workflow notes.
- `FEATURES.md` is the public current-capability inventory.
- `CHANGELOG.md` is public release history.
- `TODO.md` is the roadmap/backlog.
- `AGENTS.md` is for AI/developer operating context, not marketing copy.
- Package metadata targets public npm publishing. `tsdown` builds `dist/`; package smoke checks validate bins, exports, and pack contents.
- If public behavior changes, update the relevant public docs in the same task.
- If architecture, boundaries, config shape, or workflow changes, update this file only with durable guidance.

## Development Workflow

1. Inspect current code, tests, and docs before changing behavior.
2. Keep changes minimal and aligned with existing boundaries.
3. Add or update tests for behavior changes.
4. Keep user-facing errors safe: no stack traces, tokens, filesystem secrets, raw provider bodies, or credentials.
5. Use `async` and `await`; avoid promise chains unless they make control flow clearer.
6. Run available verification before claiming completion.

## Repo-Local AI Skills

- Development-only repository skills live in `skills/development/<name>/SKILL.md`.
- OpenCode loads only development skills through `opencode.jsonc` with `skills.paths: ["./skills/development"]`; do not point it at `./skills` or `./bundled-skills`, because bundled user skills would pollute this repo's development context.
- Claude Code plugin metadata lives in `.claude-plugin/plugin.json` and loads development skills from `skills/development/`; do not duplicate canonical skills under `.claude/skills/`.
- Codex plugin metadata lives in `.codex-plugin/plugin.json`, with the repo-local marketplace at `.agents/plugins/marketplace.json` pointing to this repository as the local plugin source.
- User-facing bundled skills live in `bundled-skills/<name>/SKILL.md`. These are package assets for OpenCode Remote users and should not be auto-loaded while developing this repository.
- `tests/runtime/aiSkillRegistration.test.js` verifies the registration layout.
- Runtime gateway prompt strings that encode Telegram markers, sticker catalogs, reaction feedback, captionless image behavior, or group context are protocol code, not skills. Keep them in adapter/core prompt builders unless OpenCode later exposes reliable gateway-controlled skill invocation.
- Gateway-generated user/project skills belong to the target OpenCode project under `.opencode/skills/opencode-remote-generated/<skill-name>/SKILL.md`, or a global user scope when explicitly requested. Never write generated skills into this repository's `skills/development/` or `bundled-skills/` directories.
- User-facing bundled OpenCode runtime assets may live under `bundled-skills/`, but OpenCode sees them only after project-local install into `.opencode/`.
- Install the bundled meme workflow as a project-local skill and clean up the legacy `.opencode/agent/opencode-remote-meme.md` path if present.
- Telegram should not force prompts into a bundled OpenCode agent; the active OpenCode session decides whether to invoke discoverable agents and skills.
- Do not write bundled runtime assets to global OpenCode config by default.
- Generated media markers must stay constrained to gateway-controlled generated-media files.
- Repo-local OpenCode agents live under `.opencode/agent/`. `opencode-remote-diagnostician` is a read-only subagent for safe gateway failure investigation; do not use it for edits, commits, live service mutation, or runtime prompt behavior.
- Future agents should be added only for concrete recurring development workflows. Do not add broad runtime agents for gateway behavior without a specific bounded job and tests.

## GitHub Issue Task Workflow

- Repo-local skill: `skills/development/github-project-task-workflow/SKILL.md`.
- Use it when the user asks to create, start, select, or finish GitHub issue-scoped work, task branches, or task worktrees.
- "Let's create a task" means create a GitHub issue using `.github/ISSUE_TEMPLATE/task.md` as the body structure; do not create or edit GitHub Project items.
- Issue-scoped task branches must use `github-login/issue-number-title-slug`, for example `crankshift/42-fix-telegram-album-cleanup`.
- Work without an issue is allowed when the user chooses it; use `github-login/free-task-name` and never invent issue numbers.
- Before creating a pull request, bump `package.json` version and update `CHANGELOG.md`; merged PRs trigger the release tag build from the package version.
- GitHub Project board management is maintainer-owned and manual. Do not require board access or run `gh project` commands in the repo-local workflow.

## Roadmap Guardrails

- Do not describe planned items as shipped. Verify current capability in source/tests and `FEATURES.md`.
- Do not add Hono, Express, or another HTTP framework unless webhooks, health checks, metrics, or admin APIs are explicitly requested.
- Signal should be added as an adapter, not by duplicating OpenCode/session logic.
- Permission approvals must stay explicit; never auto-approve OpenCode permissions by default.
- Multi-user support, group-first Telegram behavior, scheduled tasks, MCP browsing, OpenCode skills browsing, model switching, and project/worktree switching are future work unless explicitly requested.
