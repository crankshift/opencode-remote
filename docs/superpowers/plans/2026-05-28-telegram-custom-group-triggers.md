# Telegram Custom Group Triggers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-group Telegram custom trigger phrases that route group messages when a configured phrase appears anywhere in text, captions, or voice transcripts.

**Architecture:** Store custom triggers in the existing per-group settings JSON as `customTriggers: string[]`. Keep routing logic in `src/adapters/telegram/groupRouting.js`, persistence normalization in `src/adapters/telegram/groupStore.js`, DM menu state in `src/adapters/telegram/groupMenu.js`, and Telegram wiring in `src/adapters/telegram/bot.js`.

**Tech Stack:** Node.js ESM, grammY, SQLite via `node:sqlite`, Vitest, Biome.

---

## File Map

- Modify `src/adapters/telegram/groupRouting.js`: constants, trigger phrase normalization, custom trigger routing.
- Modify `src/adapters/telegram/groupStore.js`: settings normalization so persisted/missing `customTriggers` becomes a bounded array.
- Modify `src/adapters/telegram/groupMenu.js`: DM menu add/remove/clear flows and pending phrase capture.
- Modify `src/adapters/telegram/bot.js`: call the pending custom trigger handler before normal private text prompt handling.
- Modify `tests/adapters/telegramGroupRouting.test.js`: custom trigger routing tests.
- Modify `tests/adapters/telegramGroupStore.test.js`: persistence/default normalization tests.
- Modify `tests/adapters/telegramGroupMenu.test.js`: add/remove/clear menu flow tests.
- Modify `tests/adapters/telegramBot.test.js`: integration test for private setup plus group routing.
- Modify `README.md` and `FEATURES.md`: document custom group triggers.

## Task 1: Routing And Store Normalization

**Files:**
- Modify: `tests/adapters/telegramGroupRouting.test.js`
- Modify: `tests/adapters/telegramGroupStore.test.js`
- Modify: `src/adapters/telegram/groupRouting.js`
- Modify: `src/adapters/telegram/groupStore.js`

- [ ] **Step 1: Add failing routing tests**

Append these tests inside the `describe("evaluateGroupMessageRouting", () => { ... })` block in `tests/adapters/telegramGroupRouting.test.js`:

```js
  test("routes custom triggers anywhere case-insensitively", () => {
    const settings = {
      ...DEFAULT_GROUP_SETTINGS,
      customTriggers: ["codex please"],
    }

    expect(
      evaluateGroupMessageRouting({
        message: message({ text: "Can CODEX    please check this?" }),
        settings,
        botIdentity,
      }),
    ).toEqual({ route: true, trigger: "custom" })
  })

  test("treats custom trigger phrases as plain text", () => {
    const settings = {
      ...DEFAULT_GROUP_SETTINGS,
      customTriggers: ["ship.bot"],
    }

    expect(
      evaluateGroupMessageRouting({
        message: message({ text: "shipXbot should not match" }),
        settings,
        botIdentity,
      }),
    ).toEqual({ route: false, reason: "not_addressed" })

    expect(
      evaluateGroupMessageRouting({
        message: message({ text: "please ask ship.bot for help" }),
        settings,
        botIdentity,
      }),
    ).toEqual({ route: true, trigger: "custom" })
  })
```

- [ ] **Step 2: Add failing store tests**

In `tests/adapters/telegramGroupStore.test.js`, update the first persistence test's `updateSettings` call and expectation:

```js
    await store.updateSettings(-1001, {
      replyPolicy: "all",
      triggers: { nameAnywhere: true },
      context: { messages: 50 },
      customTriggers: ["  Codex    please  ", "codex please", "shipbot"],
    })
```

Add this property to the expected settings object:

```js
      customTriggers: ["Codex please", "shipbot"],
```

Add this test to the `createMemoryGroupStore` describe block:

```js
  test("normalizes missing and oversized custom triggers", async () => {
    const store = createMemoryGroupStore({ allowedChatIds: [-1001] })
    await store.updateSettings(-1001, {
      customTriggers: [
        " alpha  trigger ",
        "ALPHA trigger",
        "x".repeat(65),
        ...Array.from({ length: 25 }, (_, index) => `trigger ${index}`),
      ],
    })

    const settings = await store.getSettings(-1001)

    expect(settings.customTriggers).toHaveLength(20)
    expect(settings.customTriggers[0]).toBe("alpha trigger")
    expect(settings.customTriggers).not.toContain("x".repeat(65))
  })
```

- [ ] **Step 3: Run focused tests to verify failure**

Run: `pnpm test -- tests/adapters/telegramGroupRouting.test.js tests/adapters/telegramGroupStore.test.js`

Expected: FAIL because `customTriggers` routing and normalization are not implemented yet.

- [ ] **Step 4: Implement custom trigger routing**

In `src/adapters/telegram/groupRouting.js`, add constants and default settings:

```js
export const CUSTOM_TRIGGER_MAX_COUNT = 20
export const CUSTOM_TRIGGER_MAX_LENGTH = 64

export const DEFAULT_GROUP_SETTINGS = {
  replyPolicy: "humans",
  triggers: {
    reply: true,
    mention: true,
    namePrefix: true,
    nameAnywhere: false,
    voiceName: false,
  },
  customTriggers: [],
}
```

Add the custom trigger check after `nameAnywhere`:

```js
  if (matchesCustomTrigger(text, normalizedSettings.customTriggers)) {
    return { route: true, trigger: "custom" }
  }
```

Update `normalizeGroupSettings`:

```js
export function normalizeGroupSettings(settings = {}) {
  const triggers = { ...DEFAULT_GROUP_SETTINGS.triggers, ...(settings.triggers ?? {}) }
  return {
    ...DEFAULT_GROUP_SETTINGS,
    ...settings,
    triggers,
    customTriggers: normalizeCustomTriggers(settings.customTriggers),
  }
}
```

Add helpers near the bottom of the file:

```js
export function normalizeCustomTriggerPhrase(value) {
  const phrase = String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
  if (!phrase || phrase.length > CUSTOM_TRIGGER_MAX_LENGTH) {
    return null
  }
  return phrase
}

export function normalizeCustomTriggers(values) {
  const result = []
  const seen = new Set()
  for (const value of Array.isArray(values) ? values : []) {
    const phrase = normalizeCustomTriggerPhrase(value)
    const key = phrase?.toLocaleLowerCase("en-US")
    if (!phrase || seen.has(key)) {
      continue
    }
    seen.add(key)
    result.push(phrase)
    if (result.length >= CUSTOM_TRIGGER_MAX_COUNT) {
      break
    }
  }
  return result
}

function matchesCustomTrigger(text, triggers) {
  const candidate = normalizeComparableText(text)
  if (!candidate) {
    return false
  }
  return triggers.some((trigger) => candidate.includes(normalizeComparableText(trigger)))
}

function normalizeComparableText(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en-US")
}
```

- [ ] **Step 5: Ensure store merge preserves normalized custom triggers**

In `src/adapters/telegram/groupStore.js`, import `normalizeCustomTriggers`:

```js
import {
  DEFAULT_GROUP_SETTINGS,
  normalizeCustomTriggers,
  normalizeGroupSettings,
} from "./groupRouting.js"
```

Add `customTriggers` to `mergeGroupConfig` before `memory`:

```js
    customTriggers: normalizeCustomTriggers(
      patch?.customTriggers ?? base?.customTriggers ?? DEFAULT_GROUP_CONFIG.customTriggers,
    ),
```

- [ ] **Step 6: Run focused tests to verify pass**

Run: `pnpm test -- tests/adapters/telegramGroupRouting.test.js tests/adapters/telegramGroupStore.test.js`

Expected: PASS for both files.

- [ ] **Step 7: Commit routing/store work**

Run:

```bash
git add src/adapters/telegram/groupRouting.js src/adapters/telegram/groupStore.js tests/adapters/telegramGroupRouting.test.js tests/adapters/telegramGroupStore.test.js
git commit -m "feat: route Telegram groups by custom triggers"
```

## Task 2: DM Group Menu Management

**Files:**
- Modify: `tests/adapters/telegramGroupMenu.test.js`
- Modify: `src/adapters/telegram/groupMenu.js`

- [ ] **Step 1: Add failing menu flow tests**

Append this test to `tests/adapters/telegramGroupMenu.test.js`:

```js
  test("adds, removes, and clears custom triggers through DM menu", async () => {
    const store = createMemoryGroupStore({ allowedChatIds: [-1001] })
    const menu = createTelegramGroupMenu({ store, memory: createGroupMemory() })
    const reply = vi.fn(async (_text, options) => ({ reply_markup: options?.reply_markup }))

    await menu.handleCommand({
      from: { id: 123 },
      chat: { id: 123, type: "private" },
      message: { chat: { id: 123, type: "private" } },
      reply,
    })
    const selectData = reply.mock.calls[0][1].reply_markup.inline_keyboard[0][0].callback_data
    await menu.handleCallback({
      from: { id: 123 },
      match: [selectData, selectData.replace("group:", "")],
      answerCallbackQuery: vi.fn(async () => undefined),
      reply,
    })

    const addButton = reply.mock.calls.at(-1)[1].reply_markup.inline_keyboard
      .flat()
      .find((button) => button.text === "Add custom trigger")
    await menu.handleCallback({
      from: { id: 123 },
      match: [addButton.callback_data, addButton.callback_data.replace("group:", "")],
      answerCallbackQuery: vi.fn(async () => undefined),
      reply,
    })
    expect(reply.mock.calls.at(-1)[0]).toContain("Send the custom trigger phrase")

    expect(
      await menu.handlePendingText({
        from: { id: 123 },
        chat: { id: 123, type: "private" },
        message: { text: "  Codex    please  " },
        reply,
      }),
    ).toBe(true)
    expect((await store.getSettings(-1001)).customTriggers).toEqual(["Codex please"])

    const removeButton = reply.mock.calls.at(-1)[1].reply_markup.inline_keyboard
      .flat()
      .find((button) => button.text === "Remove custom trigger")
    await menu.handleCallback({
      from: { id: 123 },
      match: [removeButton.callback_data, removeButton.callback_data.replace("group:", "")],
      answerCallbackQuery: vi.fn(async () => undefined),
      reply,
    })
    const phraseButton = reply.mock.calls.at(-1)[1].reply_markup.inline_keyboard
      .flat()
      .find((button) => button.text === "Codex please")
    await menu.handleCallback({
      from: { id: 123 },
      match: [phraseButton.callback_data, phraseButton.callback_data.replace("group:", "")],
      answerCallbackQuery: vi.fn(async () => undefined),
      reply,
    })
    expect((await store.getSettings(-1001)).customTriggers).toEqual([])

    await store.updateSettings(-1001, { customTriggers: ["shipbot"] })
    await menu.handleCommand({
      from: { id: 123 },
      chat: { id: 123, type: "private" },
      message: { chat: { id: 123, type: "private" } },
      reply,
    })
    const selectAgain = reply.mock.calls.at(-1)[1].reply_markup.inline_keyboard[0][0].callback_data
    await menu.handleCallback({
      from: { id: 123 },
      match: [selectAgain, selectAgain.replace("group:", "")],
      answerCallbackQuery: vi.fn(async () => undefined),
      reply,
    })
    const clearButton = reply.mock.calls.at(-1)[1].reply_markup.inline_keyboard
      .flat()
      .find((button) => button.text === "Clear custom triggers")
    await menu.handleCallback({
      from: { id: 123 },
      match: [clearButton.callback_data, clearButton.callback_data.replace("group:", "")],
      answerCallbackQuery: vi.fn(async () => undefined),
      reply,
    })
    expect((await store.getSettings(-1001)).customTriggers).toEqual([])
  })
```

Append this validation test:

```js
  test("rejects invalid custom trigger phrases", async () => {
    const store = createMemoryGroupStore({ allowedChatIds: [-1001] })
    await store.updateSettings(-1001, { customTriggers: ["shipbot"] })
    const menu = createTelegramGroupMenu({ store, memory: createGroupMemory() })
    const reply = vi.fn(async (_text, options) => ({ reply_markup: options?.reply_markup }))

    await menu.startCustomTriggerAddForTesting?.(123, -1001)
    expect(
      await menu.handlePendingText({
        from: { id: 123 },
        chat: { id: 123, type: "private" },
        message: { text: "SHIPBOT" },
        reply,
      }),
    ).toBe(true)

    expect(reply).toHaveBeenCalledWith("That custom trigger is already configured.")
    expect((await store.getSettings(-1001)).customTriggers).toEqual(["shipbot"])
  })
```

- [ ] **Step 2: Run focused test to verify failure**

Run: `pnpm test -- tests/adapters/telegramGroupMenu.test.js`

Expected: FAIL because `handlePendingText` and custom trigger callbacks do not exist.

- [ ] **Step 3: Implement menu state and callbacks**

In `src/adapters/telegram/groupMenu.js`, import trigger constants:

```js
import {
  CUSTOM_TRIGGER_MAX_COUNT,
  CUSTOM_TRIGGER_MAX_LENGTH,
  normalizeCustomTriggerPhrase,
} from "./groupRouting.js"
```

Add pending state near `groupTokens`:

```js
  const pendingCustomTriggerAdds = new Map()
```

Expose `handlePendingText` and a testing helper in the returned object:

```js
    async handlePendingText(ctx) {
      return handlePendingCustomTriggerText(ctx)
    },

    async startCustomTriggerAddForTesting(userId, chatId) {
      pendingCustomTriggerAdds.set(userId, { chatId })
    },
```

Add callback cases before the final `Group selected` branch:

```js
      if (selection.action === "add_custom_trigger") {
        pendingCustomTriggerAdds.set(selection.userId, { chatId: selection.chatId })
        await ctx.answerCallbackQuery({ text: "Send trigger phrase" })
        await ctx.reply(
          `Send the custom trigger phrase for this group. It can be up to ${CUSTOM_TRIGGER_MAX_LENGTH} characters. Send /cancel to stop.`,
        )
        return
      }
      if (selection.action === "remove_custom_trigger") {
        await ctx.answerCallbackQuery({ text: "Select trigger" })
        await replyWithCustomTriggerRemoveMenu(ctx, selection.chatId, selection.userId)
        return
      }
      if (selection.action === "remove_custom_trigger_phrase") {
        const settings = await store.getSettings(selection.chatId)
        const key = customTriggerKey(selection.phrase)
        await store.updateSettings(selection.chatId, {
          customTriggers: settings.customTriggers.filter(
            (phrase) => customTriggerKey(phrase) !== key,
          ),
        })
        await ctx.answerCallbackQuery({ text: "Custom trigger removed" })
        await replyWithSettingsMenu(ctx, selection.chatId, selection.userId)
        return
      }
      if (selection.action === "clear_custom_triggers") {
        await store.updateSettings(selection.chatId, { customTriggers: [] })
        await ctx.answerCallbackQuery({ text: "Custom triggers cleared" })
        await replyWithSettingsMenu(ctx, selection.chatId, selection.userId)
        return
      }
```

Add custom trigger buttons in `replyWithSettingsMenu` after trigger toggles:

```js
    const addTriggerToken = groupTokens.add({ action: "add_custom_trigger", chatId, userId })
    keyboard.text("Add custom trigger", `group:${addTriggerToken}`).row()
    if (settings.customTriggers.length > 0) {
      const removeTriggerToken = groupTokens.add({
        action: "remove_custom_trigger",
        chatId,
        userId,
      })
      keyboard.text("Remove custom trigger", `group:${removeTriggerToken}`).row()
      const clearTriggerToken = groupTokens.add({
        action: "clear_custom_triggers",
        chatId,
        userId,
      })
      keyboard.text("Clear custom triggers", `group:${clearTriggerToken}`).row()
    }
```

Add helper functions before `maybeSendGroupNotice`:

```js
  async function replyWithCustomTriggerRemoveMenu(ctx, chatId, userId) {
    const settings = await store.getSettings(chatId)
    if (settings.customTriggers.length === 0) {
      await ctx.reply("No custom triggers are configured for this group.")
      return
    }
    const keyboard = new InlineKeyboard()
    for (const phrase of settings.customTriggers) {
      const token = groupTokens.add({
        action: "remove_custom_trigger_phrase",
        chatId,
        userId,
        phrase,
      })
      keyboard.text(phrase, `group:${token}`).row()
    }
    await ctx.reply("Select a custom trigger to remove:", { reply_markup: keyboard })
  }

  async function handlePendingCustomTriggerText(ctx) {
    if (!isPrivateChat(ctx)) {
      return false
    }
    const userId = ctx.from?.id
    const pending = pendingCustomTriggerAdds.get(userId)
    if (!pending) {
      return false
    }
    const text = String(ctx.message?.text ?? "")
    if (text.trim() === "/cancel") {
      pendingCustomTriggerAdds.delete(userId)
      await ctx.reply("Custom trigger setup cancelled.")
      return true
    }
    const rawPhrase = text.trim().replace(/\s+/g, " ")
    if (!rawPhrase) {
      await ctx.reply("Custom trigger cannot be empty. Send another phrase or /cancel.")
      return true
    }
    if (rawPhrase.length > CUSTOM_TRIGGER_MAX_LENGTH) {
      await ctx.reply(`Custom trigger must be ${CUSTOM_TRIGGER_MAX_LENGTH} characters or fewer.`)
      return true
    }
    const settings = await store.getSettings(pending.chatId)
    if (settings.customTriggers.length >= CUSTOM_TRIGGER_MAX_COUNT) {
      pendingCustomTriggerAdds.delete(userId)
      await ctx.reply(`This group already has ${CUSTOM_TRIGGER_MAX_COUNT} custom triggers.`)
      return true
    }
    const phrase = normalizeCustomTriggerPhrase(rawPhrase)
    if (settings.customTriggers.some((existing) => customTriggerKey(existing) === customTriggerKey(phrase))) {
      await ctx.reply("That custom trigger is already configured.")
      return true
    }
    pendingCustomTriggerAdds.delete(userId)
    await store.updateSettings(pending.chatId, {
      customTriggers: [...settings.customTriggers, phrase],
    })
    await ctx.reply(`Added custom trigger: ${phrase}`)
    await replyWithSettingsMenu(ctx, pending.chatId, userId)
    return true
  }
```

Update `formatGroupSettings` to include custom triggers:

```js
    `Custom triggers: ${formatCustomTriggers(settings.customTriggers)}`,
```

Add formatting helper:

```js
function formatCustomTriggers(customTriggers = []) {
  return customTriggers.length === 0 ? "none" : customTriggers.join(", ")
}

function customTriggerKey(value) {
  return String(value ?? "").toLocaleLowerCase("en-US")
}
```

- [ ] **Step 4: Run focused menu test to verify pass**

Run: `pnpm test -- tests/adapters/telegramGroupMenu.test.js`

Expected: PASS.

- [ ] **Step 5: Commit menu work**

Run:

```bash
git add src/adapters/telegram/groupMenu.js tests/adapters/telegramGroupMenu.test.js
git commit -m "feat: manage Telegram custom group triggers"
```

## Task 3: Telegram Bot Integration

**Files:**
- Modify: `tests/adapters/telegramBot.test.js`
- Modify: `src/adapters/telegram/bot.js`

- [ ] **Step 1: Add failing bot integration test**

Append this test near the other group routing tests in `tests/adapters/telegramBot.test.js`:

```js
  test("custom group triggers can be configured in DM and route group text", async () => {
    const controller = { sendPrompt: vi.fn(async () => "custom answer") }
    const groupStore = createMemoryGroupStore({ allowedChatIds: [-1001] })
    await groupStore.upsertKnownGroup({ chatId: -1001, title: "Build Room", type: "supergroup" })
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram({ allowedUserIds: [123], allowedChatIds: [-1001] }),
      controller,
      groupStore,
      groupMemory: createGroupMemory({ contextMessages: 10, contextChars: 1_000 }),
      botIdentity: { id: 9001, username: "OpenCodeRemoteBot", firstName: "Khmara" },
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })
    const dmReply = vi.fn(async (_text, options) => ({ reply_markup: options?.reply_markup }))

    await bot.commands.get("group")({
      from: { id: 123, is_bot: false },
      chat: { id: 123, type: "private" },
      message: { text: "/group", chat: { id: 123, type: "private" } },
      reply: dmReply,
    })
    const selectData = dmReply.mock.calls[0][1].reply_markup.inline_keyboard[0][0].callback_data
    await bot.callbackHandlers[0].handler({
      from: { id: 123, is_bot: false },
      match: [selectData, selectData.replace("group:", "")],
      answerCallbackQuery: vi.fn(async () => undefined),
      reply: dmReply,
    })
    const addButton = dmReply.mock.calls.at(-1)[1].reply_markup.inline_keyboard
      .flat()
      .find((button) => button.text === "Add custom trigger")
    await bot.callbackHandlers[0].handler({
      from: { id: 123, is_bot: false },
      match: [addButton.callback_data, addButton.callback_data.replace("group:", "")],
      answerCallbackQuery: vi.fn(async () => undefined),
      reply: dmReply,
    })

    await bot.messageHandlers.get("message:text")({
      from: { id: 123, is_bot: false },
      chat: { id: 123, type: "private" },
      message: { message_id: 5, text: "codex please", chat: { id: 123, type: "private" } },
      api: { sendChatAction: vi.fn(async () => undefined), setMessageReaction: vi.fn(async () => true) },
      reply: dmReply,
    })

    await bot.messageHandlers.get("message:text")({
      message: {
        message_id: 10,
        text: "we use sqlite here",
        chat: { id: -1001, type: "supergroup" },
        from: { id: 777, is_bot: false, first_name: "Ada" },
      },
      chat: { id: -1001, type: "supergroup" },
      api: { sendChatAction: vi.fn(async () => undefined), setMessageReaction: vi.fn(async () => true) },
      reply: vi.fn(async () => undefined),
    })
    const groupReply = vi.fn(async () => ({ message_id: 12, chat: { id: -1001 }, text: "custom answer" }))
    await bot.messageHandlers.get("message:text")({
      message: {
        message_id: 11,
        text: "Can CODEX    please summarize?",
        chat: { id: -1001, type: "supergroup" },
        from: { id: 778, is_bot: false, first_name: "Grace" },
      },
      chat: { id: -1001, type: "supergroup" },
      api: { sendChatAction: vi.fn(async () => undefined), setMessageReaction: vi.fn(async () => true) },
      reply: groupReply,
    })

    expect(controller.sendPrompt).toHaveBeenCalledTimes(1)
    expect(controller.sendPrompt.mock.calls[0][0].text).toContain("Ada: we use sqlite here")
    expect(groupReply).toHaveBeenCalledWith("custom answer")
  })
```

- [ ] **Step 2: Run focused bot test to verify failure**

Run: `pnpm test -- tests/adapters/telegramBot.test.js`

Expected: FAIL because private pending trigger text is still sent through normal prompt handling.

- [ ] **Step 3: Wire pending text handling before normal text prompts**

In `src/adapters/telegram/bot.js`, update the `bot.on("message:text", async (ctx) => {` handler start:

```js
  bot.on("message:text", async (ctx) => {
    if (await groupMenu.handlePendingText?.(ctx)) {
      return
    }
    if (ctx.message.text.startsWith("/")) {
      return
    }
```

- [ ] **Step 4: Run focused bot test to verify pass**

Run: `pnpm test -- tests/adapters/telegramBot.test.js`

Expected: PASS.

- [ ] **Step 5: Commit bot integration**

Run:

```bash
git add src/adapters/telegram/bot.js tests/adapters/telegramBot.test.js
git commit -m "feat: wire Telegram custom group triggers"
```

## Task 4: Public Documentation

**Files:**
- Modify: `README.md`
- Modify: `FEATURES.md`

- [ ] **Step 1: Update README group routing docs**

Find the Telegram group routing section in `README.md` and add:

```md
- Custom trigger phrases are configured per group from `/group` in DM. They are plain text, case-insensitive, and match anywhere in text, captions, and voice transcripts.
```

- [ ] **Step 2: Update FEATURES group feature list**

Find the Telegram group support bullets in `FEATURES.md` and add:

```md
- Per-group custom trigger phrases managed from the DM `/group` menu.
```

- [ ] **Step 3: Run docs-adjacent checks**

Run: `pnpm run lint`

Expected: PASS with `Checked ... files ... No fixes applied.`

- [ ] **Step 4: Commit docs**

Run:

```bash
git add README.md FEATURES.md
git commit -m "docs: document Telegram custom group triggers"
```

## Task 5: Full Verification

**Files:**
- Verify all modified files.

- [ ] **Step 1: Run full verification**

Run: `pnpm run check`

Expected: PASS. This runs Biome, Vitest coverage, package smoke, and workflow smoke.

- [ ] **Step 2: Inspect final status**

Run: `git status --short`

Expected: no unstaged implementation files. If the plan file remains uncommitted, commit it with the final implementation or a docs commit before declaring completion.

- [ ] **Step 3: Summarize commits and verification evidence**

Report the final commit hashes and the exact verification command result, including test file and test counts from `pnpm run check`.
