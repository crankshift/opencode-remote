# OpenCode Subagent Orchestration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make OpenCode Remote handle long-running, tool-heavy, subagent-driven prompts without dropping child-session permissions or failing at the default SDK request timeout.

**Architecture:** Keep Telegram rendering in the adapter and OpenCode SDK/event shapes in `src/core/opencode/client.js`. Serialize prompt sends through the gateway controller so one active OpenCode run owns the event stream at a time, then let that run accept child-session tool and permission events safely. Add a bounded prompt timeout config so slow providers like Ollama Cloud can finish instead of failing around five minutes.

**Tech Stack:** Node.js ESM, `@opencode-ai/sdk`, grammY, Zod config validation, Vitest.

---

### Task 1: Configurable OpenCode Prompt Timeout

**Files:**
- Modify: `src/config/loadConfig.js`
- Modify: `src/runtime/bootstrap.js`
- Modify: `src/core/opencode/client.js`
- Test: `tests/config/loadConfig.test.js`
- Test: `tests/runtime/bootstrap.test.js`
- Test: `tests/core/opencodeClient.test.js`

- [ ] **Step 1: Write failing config tests**

Add tests showing `opencode.promptTimeoutMs` defaults to `1800000` and accepts a custom positive integer.

- [ ] **Step 2: Run config tests and verify they fail**

Run: `pnpm exec vitest run tests/config/loadConfig.test.js`

Expected: FAIL because `promptTimeoutMs` is missing from normalized config.

- [ ] **Step 3: Implement config parsing**

Add `promptTimeoutMs: z.number().int().positive().default(1_800_000)` under `opencode`, and include it in the normalized return object.

- [ ] **Step 4: Write failing SDK/bootstrap tests**

Add a client factory test proving `createOpenCodeClient({ promptTimeoutMs })` passes `timeout` to `createOpencodeClient`, and a bootstrap test proving runtime passes `resolvedConfig.opencode.promptTimeoutMs` into the OpenCode client factory.

- [ ] **Step 5: Run targeted tests and verify they fail**

Run: `pnpm exec vitest run tests/core/opencodeClient.test.js tests/runtime/bootstrap.test.js`

Expected: FAIL because timeout is not passed through yet.

- [ ] **Step 6: Implement timeout pass-through**

Add `promptTimeoutMs` and injectable `sdkFactory` to `createOpenCodeClient`, pass `timeout: promptTimeoutMs` to `createOpencodeClient`, and pass the config value from `runGateway`.

- [ ] **Step 7: Run targeted tests and verify they pass**

Run: `pnpm exec vitest run tests/config/loadConfig.test.js tests/core/opencodeClient.test.js tests/runtime/bootstrap.test.js`

Expected: PASS.

### Task 2: Serialize Gateway Prompt Sends

**Files:**
- Modify: `src/core/gateway/controller.js`
- Test: `tests/core/controller.test.js`

- [ ] **Step 1: Write failing serialization test**

Add a test that starts two `controller.sendPrompt()` calls on the same active session, blocks the first inside the OpenCode mock, and asserts the second `opencode.sendPrompt` call does not start until the first resolves.

- [ ] **Step 2: Run controller test and verify it fails**

Run: `pnpm exec vitest run tests/core/controller.test.js`

Expected: FAIL because current controller sends both prompts concurrently.

- [ ] **Step 3: Implement prompt queue**

Add a controller-local promise queue wrapping `sendPrompt`. Resolve active session and call OpenCode inside the queued action. Ensure rejected prompt calls do not poison the queue by storing `promptQueue = run.catch(() => undefined)`.

- [ ] **Step 4: Run controller test and verify it passes**

Run: `pnpm exec vitest run tests/core/controller.test.js`

Expected: PASS.

### Task 3: Accept Child Session Tool And Permission Events During Active Runs

**Files:**
- Modify: `src/core/opencode/client.js`
- Modify: `src/core/gateway/controller.js`
- Modify: `src/core/formatting/progressText.js`
- Modify: `src/adapters/telegram/bot.js`
- Test: `tests/core/opencodeClient.test.js`
- Test: `tests/core/progressText.test.js`

- [ ] **Step 1: Write failing child permission test**

Add an OpenCode client test where `sendPrompt("ses_parent", ..., { onSystemEvent, includeChildSessionEvents: true })` receives a `permission.asked` event with `sessionID: "ses_child"` and asserts `onSystemEvent` receives `sessionId: "ses_child"`.

- [ ] **Step 2: Write failing child tool progress test**

Add an OpenCode client test where a `message.part.updated` tool event with `sessionID: "ses_child"` is emitted during a parent prompt and `includeChildSessionEvents: true` forwards it with `parentSessionId: "ses_parent"` and `childSession: true`.

- [ ] **Step 3: Run OpenCode client tests and verify they fail**

Run: `pnpm exec vitest run tests/core/opencodeClient.test.js`

Expected: FAIL because child session IDs are currently filtered out.

- [ ] **Step 4: Implement child-session event acceptance**

Thread an `includeChildSessionEvents` option through `startPromptEventStream`. Update progress and permission normalization to accept non-parent session IDs when that option is true. Preserve the actual child `sessionId`, add `parentSessionId` for child events, and add `childSession: true` without exposing raw session IDs in Telegram logs.

- [ ] **Step 5: Make controller enable child events for gateway prompts**

When controller passes options to `opencode.sendPrompt`, include `includeChildSessionEvents: true`. Preserve existing callbacks and do not put this option into the OpenCode prompt body.

- [ ] **Step 6: Update formatting for task/subagent progress**

Keep existing `task` emoji behavior and ensure child-session progress still renders as a normal activity line without exposing session IDs.

- [ ] **Step 7: Run targeted tests and verify they pass**

Run: `pnpm exec vitest run tests/core/opencodeClient.test.js tests/core/controller.test.js tests/core/progressText.test.js`

Expected: PASS.

### Task 4: Normalize And Log OpenCode Session Errors Safely

**Files:**
- Modify: `src/core/opencode/client.js`
- Modify: `src/adapters/telegram/bot.js`
- Test: `tests/core/opencodeClient.test.js`
- Test: `tests/adapters/telegramBot.test.js`

- [ ] **Step 1: Write failing session error normalization test**

Add a test where the event stream emits `session.error` with a provider-ish error object and asserts `onSystemEvent` receives `{ type: "session.error", sessionId, errorName, errorKind }` without raw payload details.

- [ ] **Step 2: Run OpenCode client test and verify it fails**

Run: `pnpm exec vitest run tests/core/opencodeClient.test.js`

Expected: FAIL because `session.error` is ignored.

- [ ] **Step 3: Implement safe session error normalization**

Extend `normalizeOpenCodeSystemEvent` to return `session.error` events. Keep only safe metadata: type, session presence, child-session flag, error name, and a coarse kind such as `provider_auth`, `aborted`, `timeout`, or `unknown`.

- [ ] **Step 4: Write Telegram logging test**

Add a Telegram bot test that calls a prompt whose `onSystemEvent` receives a `session.error`, and assert the logger warning uses safe metadata only.

- [ ] **Step 5: Implement Telegram safe log handling**

Update `handleSystemEvent` to log `OpenCode session error reported` with safe fields and no raw session ID, provider body, prompt text, or stack trace.

- [ ] **Step 6: Run targeted tests and verify they pass**

Run: `pnpm exec vitest run tests/core/opencodeClient.test.js tests/adapters/telegramBot.test.js`

Expected: PASS.

### Task 5: Docs And Verification

**Files:**
- Modify: `README.md`
- Modify: `FEATURES.md`
- Modify: `DEVELOPMENT.md`

- [ ] **Step 1: Document prompt timeout config and subagent handling**

Update public docs to mention `opencode.promptTimeoutMs` and that the gateway handles tool/skill/subagent activity and permission events during long prompts.

- [ ] **Step 2: Run lint**

Run: `pnpm run lint`

Expected: PASS.

- [ ] **Step 3: Run tests**

Run: `pnpm test`

Expected: PASS.

- [ ] **Step 4: Run package check if time permits**

Run: `pnpm run check`

Expected: PASS.
