# OpenCode Tool Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show Telegram users an editable activity message listing OpenCode tools and skills used during prompts.

**Architecture:** Normalize OpenCode `message.part.updated` tool events in the OpenCode core, pass progress callbacks through the gateway controller, and render/edit a Telegram activity message from normalized events. Keep progress best-effort so prompt responses still work if event streaming or Telegram edits fail.

**Tech Stack:** Node.js ESM, `@opencode-ai/sdk`, grammY, Vitest, Biome.

---

## File Structure

- Create `src/core/formatting/progressText.js`: progress verbosity constants, normalized event formatting, dedupe-key helpers, and safe preview truncation.
- Modify `src/config/loadConfig.js`: read `OPENCODE_PROGRESS_VERBOSITY`, defaulting to `all`.
- Modify `src/runtime/bootstrap.js`: pass progress config into the Telegram adapter.
- Modify `src/core/opencode/client.js`: accept prompt options, start/stop OpenCode event streaming, normalize tool events, and call `onProgress`.
- Modify `src/core/gateway/controller.js`: pass prompt options through to OpenCode.
- Modify `src/adapters/telegram/bot.js`: create prompt activity renderer and wire it into text/photo/reaction prompt calls.
- Create `tests/core/progressText.test.js`: cover formatter and dedupe semantics.
- Modify `tests/core/opencodeClient.test.js`: cover event streaming and normalization.
- Modify `tests/core/controller.test.js`: cover prompt option pass-through.
- Modify `tests/adapters/telegramBot.test.js`: cover activity send/edit and final flush.
- Modify `.env.example` and `README.md`: document `OPENCODE_PROGRESS_VERBOSITY`.

### Task 1: Progress Formatting

**Files:**
- Create: `src/core/formatting/progressText.js`
- Create: `tests/core/progressText.test.js`

- [ ] **Step 1: Write failing formatter tests**

Add tests for default skill formatting, repeated invocations in `all`, unique behavior in `new`, disabled behavior in `off`, and verbose preview truncation.

- [ ] **Step 2: Run formatter tests and verify failure**

Run: `pnpm test tests/core/progressText.test.js`

Expected: FAIL because `progressText.js` does not exist.

- [ ] **Step 3: Implement formatter**

Export `PROGRESS_VERBOSITIES`, `createProgressTextState`, `formatProgressEvent`, and `recordProgressEvent`. Use `partId` as the `all` dedupe key, `tool:title` as the fallback key, and `tool:title` as the `new` key.

- [ ] **Step 4: Run formatter tests and verify pass**

Run: `pnpm test tests/core/progressText.test.js`

Expected: PASS.

### Task 2: Config Plumbing

**Files:**
- Modify: `src/config/loadConfig.js`
- Modify: `src/runtime/bootstrap.js`
- Modify: `.env.example`
- Modify: `README.md`

- [ ] **Step 1: Write or update config tests if present**

Check existing config tests. If none exist, add assertions to the nearest config test file or create `tests/config/loadConfig.test.js` for default `all` and explicit `off`.

- [ ] **Step 2: Implement config value**

Add `OPENCODE_PROGRESS_VERBOSITY` as `z.enum(["off", "new", "all", "verbose"]).default("all")` and return it as `progressVerbosity`.

- [ ] **Step 3: Pass config to Telegram**

Pass `progressVerbosity: config.progressVerbosity` in `runGateway()` when creating the Telegram bot.

- [ ] **Step 4: Update docs**

Add `OPENCODE_PROGRESS_VERBOSITY=all` to `.env.example` and README configuration docs.

### Task 3: OpenCode Event Progress

**Files:**
- Modify: `src/core/opencode/client.js`
- Modify: `tests/core/opencodeClient.test.js`

- [ ] **Step 1: Write failing OpenCode progress tests**

Add tests that create a fake `sdkClient.event.list()` async iterable, send a prompt with `onProgress`, and assert a normalized `tool.updated` event for `skill_view` with title `brainstorming`. Add a session-filtering test that ignores events from another session.

- [ ] **Step 2: Implement event subscription**

In `sendPrompt(sessionId, prompt, options = {})`, start `client.event.list()` only when `options.onProgress` is a function and `client.event?.list` exists. Consume events in a background async loop and abort the stream in `finally`.

- [ ] **Step 3: Implement event normalization**

Normalize `message.part.updated` events where `part.type === "tool"`. Extract `sessionId`, `messageId`, `partId`, `tool`, `status`, `title`, and `input` from tolerant raw shapes such as `part.sessionID`, `part.messageID`, `part.state.input`, and `part.input`.

- [ ] **Step 4: Run OpenCode tests**

Run: `pnpm test tests/core/opencodeClient.test.js`

Expected: PASS.

### Task 4: Controller Pass-Through

**Files:**
- Modify: `src/core/gateway/controller.js`
- Modify: `tests/core/controller.test.js`

- [ ] **Step 1: Write failing controller test**

Add a test that calls `controller.sendPrompt("hello", { onProgress })` and expects `opencode.sendPrompt("ses_1", "hello", { onProgress })`.

- [ ] **Step 2: Implement pass-through**

Change `sendPrompt(prompt)` to `sendPrompt(prompt, options)` and pass options to `opencode.sendPrompt(sessionId, prompt, options)`.

- [ ] **Step 3: Run controller tests**

Run: `pnpm test tests/core/controller.test.js`

Expected: PASS.

### Task 5: Telegram Activity Renderer

**Files:**
- Modify: `src/adapters/telegram/bot.js`
- Modify: `tests/adapters/telegramBot.test.js`

- [ ] **Step 1: Write failing Telegram tests**

Add tests that send a text prompt while the fake controller emits two progress events. Assert the first event sends an `Activity` reply and the second event edits that same message through `ctx.api.editMessageText`. Assert the final assistant response is still sent separately.

- [ ] **Step 2: Implement renderer**

Add `createTelegramProgressRenderer({ ctx, logger, verbosity, editThrottleMs })`. It uses `recordProgressEvent` and sends the first activity message with `ctx.reply`. Later updates edit with `ctx.api.editMessageText(chatId, messageId, text)`. It exposes `onProgress(event)` and `flush()`.

- [ ] **Step 3: Wire prompt calls**

Wrap each `controller.sendPrompt(...)` call with a progress renderer and call `await progress.flush()` before sending final chunks.

- [ ] **Step 4: Run Telegram tests**

Run: `pnpm test tests/adapters/telegramBot.test.js`

Expected: PASS.

### Task 6: Verification

**Files:**
- All changed source, tests, and docs.

- [ ] **Step 1: Run lint**

Run: `pnpm run lint`

Expected: PASS.

- [ ] **Step 2: Run tests**

Run: `pnpm test`

Expected: PASS.

- [ ] **Step 3: Run full check**

Run: `pnpm run check`

Expected: PASS.

## Self-Review

- Spec coverage: The plan covers OpenCode event streaming, normalized progress events, Telegram activity rendering, verbosity config, docs, and tests.
- Placeholder scan: No implementation step depends on undefined behavior; tolerant extraction is explicitly scoped to known OpenCode event field names from docs and existing SDK response style.
- Type consistency: The normalized event uses `type`, `sessionId`, `messageId`, `partId`, `tool`, `title`, `status`, and `input` consistently across core formatting, OpenCode client, controller, and Telegram adapter.
