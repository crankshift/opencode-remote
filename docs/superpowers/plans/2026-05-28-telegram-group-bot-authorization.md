# Telegram Group Bot Authorization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace single-user Telegram authorization with migrated direct-user and allowed-group chat allowlists.

**Architecture:** Config migration normalizes old JSON into a v2 shape before validation. Runtime receives normalized Telegram auth config and the Telegram adapter authorizes private direct chats by `allowedUserIds` and group chats by `allowedChatIds`. Group chats force tool progress/activity off.

**Tech Stack:** Node.js ESM, grammY, Zod, Vitest, Biome, pnpm.

---

## File Structure

- Create `src/config/configMigration.js`: pure config migration helpers, including v1 `allowedUserId` to v2 `allowedUserIds` migration and obsolete `allowedBotIds` removal.
- Modify `src/config/loadConfig.js`: run migration before validation, validate `schemaVersion`, optional `allowedUserIds`, optional `allowedChatIds`, and require at least one of the two arrays to be non-empty.
- Modify `src/config/setupConfig.js`: collect optional comma-separated direct user IDs and group chat IDs, then require at least one configured list.
- Modify `src/config/writeConfig.js`: migrate current config before applying `config set` updates so old configs are rewritten as v2.
- Modify `src/adapters/telegram/auth.js`: authorize private human DMs by user ID and non-private chats by chat ID.
- Modify `src/adapters/telegram/bot.js`: pass normalized Telegram config, make `/progress` private-chat only, and force progress rendering off in groups.
- Modify `src/runtime/bootstrap.js`: pass normalized `resolvedConfig.telegram` to the bot factory.
- Modify tests in `tests/config/loadConfig.test.js`, `tests/config/writeConfig.test.js`, `tests/adapters/telegramBot.test.js`, and `tests/runtime/bootstrap.test.js`.
- Modify `README.md`, `FEATURES.md`, `AGENTS.md`, and `TODO.md` for public and maintainer behavior.

## Task 1: Config Migration And Validation

**Files:**
- Create: `src/config/configMigration.js`
- Modify: `src/config/loadConfig.js`
- Test: `tests/config/loadConfig.test.js`

- [x] **Step 1: Write failing migration tests**

Covered behaviors:

```js
test("migrates singular Telegram allowed user ID to plural v2 config", () => {})
test("prefers plural Telegram allowed user IDs when singular and plural are both present", () => {})
test("normalizes group chat allowlists without direct users", () => {})
test("rejects configs without direct users or allowed chats", () => {})
```

- [x] **Step 2: Run tests to verify they fail**

Run: `pnpm test tests/config/loadConfig.test.js`

Expected: FAIL before implementation because v2 schema and migration do not exist.

- [x] **Step 3: Implement migration and validation**

Implementation notes:

```js
export const CURRENT_CONFIG_SCHEMA_VERSION = 2
export function migrateConfig(rawConfig) {
  // Treat unversioned configs as v1.
  // Convert telegram.allowedUserId to telegram.allowedUserIds.
  // Delete obsolete telegram.allowedUserId and telegram.allowedBotIds.
}
```

Validation notes:

```js
const telegramConfigSchema = z
  .object({
    botToken: z.string().min(1, "Telegram bot token is required"),
    allowedUserIds: z.array(positiveTelegramIdSchema).default([]),
    allowedChatIds: z.array(telegramChatIdSchema).default([]),
  })
  .refine(
    (telegram) => telegram.allowedUserIds.length > 0 || telegram.allowedChatIds.length > 0,
    {
      message: "Configure at least one Telegram allowed user ID or allowed chat ID",
      path: ["allowedChatIds"],
    },
  )
```

- [x] **Step 4: Verify config tests**

Run: `pnpm test tests/config/loadConfig.test.js`

Expected: PASS.

## Task 2: Setup List Parsing

**Files:**
- Modify: `src/config/setupConfig.js`
- Test: `tests/config/loadConfig.test.js`

- [x] **Step 1: Write failing setup tests**

Covered behaviors:

```js
test("collects comma-separated Telegram direct user and group chat allowlists", () => {})
test("allows group-only setup with no direct user IDs", () => {})
```

- [x] **Step 2: Implement setup prompts**

Prompts:

```text
Telegram allowed direct user IDs, comma-separated (optional)
Telegram allowed group chat IDs, comma-separated (optional)
```

Setup warning:

```text
Allowed chat IDs authorize all messages in those groups, including messages from other bots. To receive all group messages, make this bot a group admin or disable Group Privacy Mode in BotFather. To receive messages from other bots in groups, also enable Bot-to-Bot Communication Mode. Direct messages are allowed only for configured direct user IDs.
```

Parsing rules:

- `1,2` and `1,   3` both parse.
- Direct user IDs must be positive integers.
- Group chat IDs may be negative.
- At least one direct user ID or group chat ID is required.

- [x] **Step 3: Verify setup tests**

Run: `pnpm test tests/config/loadConfig.test.js`

Expected: PASS.

## Task 3: Telegram Authorization And Private Progress

**Files:**
- Modify: `src/adapters/telegram/auth.js`
- Modify: `src/adapters/telegram/bot.js`
- Modify: `src/runtime/bootstrap.js`
- Test: `tests/adapters/telegramBot.test.js`
- Test: `tests/runtime/bootstrap.test.js`

- [x] **Step 1: Write failing auth tests**

Covered behaviors:

```js
test("authorization middleware allows configured human users in private chats", () => {})
test("authorization middleware rejects configured human users in unallowed groups", () => {})
test("authorization middleware allows humans in allowed group chats", () => {})
test("authorization middleware allows bots in allowed group chats", () => {})
test("authorization middleware rejects messages in unallowed groups", () => {})
```

- [x] **Step 2: Implement authorization helper**

Rules:

- Private chats: accept only non-bot senders in `allowedUserIds`.
- Non-private chats: accept any sender when chat ID is in `allowedChatIds`.
- Everything else is ignored without a chat reply.

- [x] **Step 3: Write failing private-progress tests**

Covered behaviors:

```js
test("progress command is private-chat only", () => {})
test("text prompts do not render tool progress in group chats", () => {})
```

- [x] **Step 4: Implement private-only progress**

Rules:

- `/progress` in groups replies `Tool progress is only available in private chats.`
- Group prompts pass no `onProgress` callback to OpenCode, while preserving permission system events.
- Private chats keep existing progress behavior.

- [x] **Step 5: Verify adapter/runtime tests**

Run: `pnpm test tests/adapters/telegramBot.test.js tests/runtime/bootstrap.test.js`

Expected: PASS.

## Task 4: Config Writes And Docs

**Files:**
- Modify: `src/config/writeConfig.js`
- Modify: `README.md`
- Modify: `FEATURES.md`
- Modify: `AGENTS.md`
- Modify: `TODO.md`
- Test: `tests/config/writeConfig.test.js`

- [x] **Step 1: Write failing config write tests**

Successful config writes should migrate old files to v2 and remove obsolete singular/bot fields.

- [x] **Step 2: Migrate before config writes**

```js
const rawConfig = migrateConfig(await readJsonConfig(configPath))
```

- [x] **Step 3: Update docs**

Docs describe:

- `allowedUserIds` for private human DMs.
- `allowedChatIds` for group access.
- Groups authorize every sender, including bots.
- Group Privacy/admin Telegram requirements.
- Bot-to-Bot Communication Mode for receiving messages from other bots in groups.
- `Activity` progress is private-chat only.

## Task 5: Final Verification

**Files:**
- All modified files.

- [x] **Step 1: Run lint**

Run: `pnpm run lint`

Expected: PASS.

- [x] **Step 2: Run tests**

Run: `pnpm test`

Expected: PASS.

- [x] **Step 3: Run full check**

Run: `pnpm run check`

Expected: PASS.

- [x] **Step 4: Inspect diff**

Run: `git diff --stat && git diff`

Expected: Diff contains only config migration, Telegram auth allowlists, setup parsing, docs, specs, and tests for issue #25.

## Self-Review

The plan covers migration, setup parsing, runtime authorization, private-only progress, docs, and verification. It intentionally avoids per-bot allowlists because the current requirement uses allowed group chat IDs as the trust boundary. No placeholders remain.
