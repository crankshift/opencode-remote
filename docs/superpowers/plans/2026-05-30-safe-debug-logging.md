# Safe Debug Logging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add comprehensive safe debug logging across runtime, Telegram, OpenCode, media, voice, sticker, permission, and state lifecycle boundaries.

**Architecture:** Keep the existing `pino` logger and add targeted structured debug logs at existing component boundaries. Use explicit safe metadata at each call site instead of logging raw Telegram/OpenCode/provider objects.

**Tech Stack:** Node.js ESM, pino, grammY, Vitest, Biome.

---

### Task 1: Runtime And OpenCode Server Logs

**Files:**
- Modify: `src/runtime/bootstrap.js`
- Modify: `src/core/opencode/serverManager.js`
- Test: `tests/runtime/bootstrap.test.js`
- Test: `tests/core/serverManager.test.js`

- [ ] Write failing tests for runtime startup milestones and OpenCode server ownership decisions.
- [ ] Add debug logs in `runGateway` around config loaded, ffmpeg check, server ensure result, project identity resolved, stores opened, commands registered, group registry refreshed, polling start, and shutdown cleanup.
- [ ] Pass `logger` into `ensureOpenCodeServer`.
- [ ] Add debug logs in `ensureOpenCodeServer` for reachable existing server, autostart disabled, child start, reachable after start, stop owned child, and startup timeout.
- [ ] Run `pnpm test tests/runtime/bootstrap.test.js tests/core/serverManager.test.js`.

### Task 2: Gateway Controller Lifecycle Logs

**Files:**
- Modify: `src/core/gateway/controller.js`
- Test: `tests/core/controller.test.js`

- [ ] Write failing tests for session creation, auto-creation before first prompt, prompt sending, permission response, and stop handling debug logs.
- [ ] Add debug logs with safe fields such as `hasActiveSession`, `hasOptions`, `hasContext`, `decision`, and `stopped`.
- [ ] Ensure prompt text, gateway context, permission payloads, and raw errors are not logged at debug level.
- [ ] Run `pnpm test tests/core/controller.test.js`.

### Task 3: Telegram Prompt Lifecycle Logs

**Files:**
- Modify: `src/adapters/telegram/bot.js`
- Test: `tests/adapters/telegramBot.test.js`

- [ ] Write failing tests for text, photo, voice, sticker, and permission lifecycle logs.
- [ ] Add local safe metadata helpers in `bot.js` only where they reduce repetition.
- [ ] Log stages such as `received`, `prompt_started`, `opencode_completed`, `reply_sent`, and `cleanup_completed`.
- [ ] Include safe metadata only: `messageKind`, `chatType`, `senderKind`, `hasThread`, `isGroup`, `attachmentCount`, `albumSize`, `voiceEnabled`, and `replyMode`.
- [ ] Run `pnpm test tests/adapters/telegramBot.test.js`.

### Task 4: Media, Voice, Sticker Milestone Logs

**Files:**
- Modify: `src/adapters/telegram/media.js`
- Modify: `src/adapters/telegram/voice.js`
- Modify: `src/adapters/telegram/stickers.js`
- Modify: `src/core/voice/voiceService.js`
- Test: `tests/adapters/telegramMedia.test.js`
- Test: `tests/adapters/telegramVoice.test.js`
- Test: `tests/adapters/telegramStickers.test.js`
- Test: `tests/core/voiceService.test.js`

- [ ] Write failing tests for safe download, cleanup, cache, render, transcribe, and synthesize logs.
- [ ] Add optional `logger` parameters where needed without changing public behavior.
- [ ] Log safe metadata such as operation kind, MIME type, byte count, sticker kind, cache hit/miss, voice mode, and configured model/voice.
- [ ] Avoid logging URLs, tokens, API keys, text, transcripts, or file paths.
- [ ] Run `pnpm test tests/adapters/telegramMedia.test.js tests/adapters/telegramVoice.test.js tests/adapters/telegramStickers.test.js tests/core/voiceService.test.js`.

### Task 5: State Store Logs

**Files:**
- Modify: `src/core/state/stateDb.js`
- Test: `tests/core/stateDb.test.js`

- [ ] Write failing tests for database initialization, project upsert, migration, read, and write logs.
- [ ] Add optional `logger` to `openStateDb` and `createProjectStateStore`.
- [ ] Log safe state lifecycle metadata without database paths or worktree paths.
- [ ] Run `pnpm test tests/core/stateDb.test.js`.

### Task 6: Docs And Release Metadata

**Files:**
- Modify: `README.md`
- Modify: `CONTRIBUTING.md`
- Modify: `AGENTS.md`
- Modify: `CHANGELOG.md`
- Modify: `package.json`

- [ ] Add README debug logging guidance near `logLevel`.
- [ ] Add CONTRIBUTING expectation that new features include safe structured logging when they have meaningful runtime decisions, external calls, cleanup, or failure modes.
- [ ] Add AGENTS durable guidance for feature logging and privacy.
- [ ] Add an Unreleased changelog entry for issue 30.
- [ ] Bump `package.json` patch version.

### Task 7: Full Verification

- [ ] Run `pnpm run lint`.
- [ ] Run `pnpm test`.
- [ ] Run `pnpm run check`.
- [ ] Inspect `git status --short` and `git diff`.
