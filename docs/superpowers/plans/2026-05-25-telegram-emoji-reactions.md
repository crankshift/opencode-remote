# Telegram Emoji Reactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Telegram emoji reactions so user reactions become OpenCode prompts, user messages show a temporary eye reaction while processing, and OpenCode can request hidden bot reactions.

**Architecture:** Keep reaction mechanics in `src/adapters/telegram/bot.js`. The Telegram adapter stores recent bot messages in bounded memory, parses hidden reaction markers out of OpenCode responses, and uses `setMessageReaction` best-effort. Runtime startup enables `message_reaction` updates through grammY long polling options.

**Tech Stack:** Node.js ESM, grammY, Vitest, Biome.

---

## File Structure

- Modify `src/adapters/telegram/bot.js`: add Telegram reaction helpers, tracked reply helper, reaction update handler, hidden marker parsing, and processing-eye behavior.
- Modify `src/runtime/bootstrap.js`: start grammY polling with `allowed_updates` that include `message_reaction`.
- Modify `tests/adapters/telegramBot.test.js`: cover processing reactions, hidden marker stripping, feedback prompts and replies from known bot messages, unknown-message no-op, and bounded message memory.
- Modify `tests/runtime/bootstrap.test.js`: assert polling is started with the expected `allowed_updates` list.
- No config or README changes are required because the behavior is enabled automatically and has no new environment variables.

## Task 1: Runtime Enables Reaction Updates

**Files:**
- Modify: `src/runtime/bootstrap.js`
- Test: `tests/runtime/bootstrap.test.js`

- [ ] **Step 1: Write the failing runtime test**

Replace the assertion in `tests/runtime/bootstrap.test.js` that currently checks `expect(bot.start).toHaveBeenCalled()` with:

```js
expect(bot.start).toHaveBeenCalledWith({
  allowed_updates: ["message", "callback_query", "message_reaction"],
})
```

- [ ] **Step 2: Run the focused runtime test**

Run: `pnpm test tests/runtime/bootstrap.test.js`

Expected: FAIL because `runGateway` currently calls `bot.start()` without polling options.

- [ ] **Step 3: Implement polling options**

In `src/runtime/bootstrap.js`, replace:

```js
await bot.start()
```

with:

```js
await bot.start({
  allowed_updates: ["message", "callback_query", "message_reaction"],
})
```

- [ ] **Step 4: Run the focused runtime test again**

Run: `pnpm test tests/runtime/bootstrap.test.js`

Expected: PASS.

## Task 2: Temporary Eye Reaction And Hidden Bot Reaction Marker

**Files:**
- Modify: `src/adapters/telegram/bot.js`
- Test: `tests/adapters/telegramBot.test.js`

- [ ] **Step 1: Write failing adapter tests**

Add these tests inside `describe("createTelegramBot", () => { ... })` in `tests/adapters/telegramBot.test.js`:

```js
test("text prompts apply and clear an eye reaction", async () => {
  const controller = {
    sendPrompt: vi.fn(async () => "answer"),
  }
  const bot = createTelegramBot({
    token: "token",
    allowedUserId: 123,
    controller,
    logger: { warn: vi.fn(), error: vi.fn() },
    botFactory: FakeBot,
  })
  const reply = vi.fn(async () => ({ message_id: 11, chat: { id: 456 }, text: "answer" }))
  const sendChatAction = vi.fn(async () => undefined)
  const setMessageReaction = vi.fn(async () => true)

  await bot.messageHandlers.get("message:text")({
    message: { message_id: 10, text: "hello", chat: { id: 456 } },
    api: { sendChatAction, setMessageReaction },
    reply,
  })

  expect(setMessageReaction).toHaveBeenNthCalledWith(1, 456, 10, [
    { type: "emoji", emoji: "👀" },
  ])
  expect(controller.sendPrompt).toHaveBeenCalledWith("hello")
  expect(reply).toHaveBeenCalledWith("answer")
  expect(setMessageReaction).toHaveBeenNthCalledWith(2, 456, 10, [])
})

test("hidden telegram reaction markers are stripped and applied to the user message", async () => {
  const controller = {
    sendPrompt: vi.fn(async () => "Nice idea.\n[telegram_reaction: 👍]"),
  }
  const bot = createTelegramBot({
    token: "token",
    allowedUserId: 123,
    controller,
    logger: { warn: vi.fn(), error: vi.fn() },
    botFactory: FakeBot,
  })
  const reply = vi.fn(async () => ({ message_id: 11, chat: { id: 456 }, text: "Nice idea." }))
  const sendChatAction = vi.fn(async () => undefined)
  const setMessageReaction = vi.fn(async () => true)

  await bot.messageHandlers.get("message:text")({
    message: { message_id: 10, text: "hello", chat: { id: 456 } },
    api: { sendChatAction, setMessageReaction },
    reply,
  })

  expect(reply).toHaveBeenCalledWith("Nice idea.")
  expect(setMessageReaction).toHaveBeenNthCalledWith(1, 456, 10, [
    { type: "emoji", emoji: "👀" },
  ])
  expect(setMessageReaction).toHaveBeenNthCalledWith(2, 456, 10, [])
  expect(setMessageReaction).toHaveBeenNthCalledWith(3, 456, 10, [
    { type: "emoji", emoji: "👍" },
  ])
})
```

- [ ] **Step 2: Run the focused adapter tests**

Run: `pnpm test tests/adapters/telegramBot.test.js`

Expected: FAIL because `setMessageReaction` is not called and hidden markers are not parsed.

- [ ] **Step 3: Implement hidden marker parsing and best-effort reactions**

In `src/adapters/telegram/bot.js`, add helpers after `formatSessionLabel`:

```js
const TELEGRAM_REACTION_MARKER = /\[telegram_reaction:\s*([^\]\n]+?)\s*\]/giu

function parseTelegramReactionMarker(text) {
  let requestedReaction = null
  const visibleText = String(text).replace(TELEGRAM_REACTION_MARKER, (_match, emoji) => {
    requestedReaction ??= emoji.trim()
    return ""
  })

  return {
    visibleText: visibleText.trim(),
    requestedReaction,
  }
}

async function setEmojiReaction(ctx, chatId, messageId, emoji, logger) {
  if (!chatId || !messageId || !ctx.api?.setMessageReaction) {
    return
  }

  try {
    await ctx.api.setMessageReaction(chatId, messageId, [{ type: "emoji", emoji }])
  } catch (error) {
    logger.warn({ error }, "Could not set Telegram message reaction")
  }
}

async function clearMessageReaction(ctx, chatId, messageId, logger) {
  if (!chatId || !messageId || !ctx.api?.setMessageReaction) {
    return
  }

  try {
    await ctx.api.setMessageReaction(chatId, messageId, [])
  } catch (error) {
    logger.warn({ error }, "Could not clear Telegram message reaction")
  }
}
```

Then replace the text handler body with logic equivalent to:

```js
const chatId = ctx.message.chat.id
const messageId = ctx.message.message_id
const stopTyping = startTypingIndicator(ctx, logger)
try {
  await setEmojiReaction(ctx, chatId, messageId, "👀", logger)
  const response = await controller.sendPrompt(ctx.message.text)
  const { visibleText, requestedReaction } = parseTelegramReactionMarker(response)
  for (const chunk of chunkText(visibleText)) {
    await ctx.reply(chunk)
  }
  await clearMessageReaction(ctx, chatId, messageId, logger)
  if (requestedReaction) {
    await setEmojiReaction(ctx, chatId, messageId, requestedReaction, logger)
  }
} finally {
  stopTyping()
}
```

- [ ] **Step 4: Run the focused adapter tests again**

Run: `pnpm test tests/adapters/telegramBot.test.js`

Expected: PASS for the new tests and existing text prompt typing test.

## Task 3: Track Bot Messages And Convert User Reactions To Prompts

**Files:**
- Modify: `src/adapters/telegram/bot.js`
- Test: `tests/adapters/telegramBot.test.js`

- [ ] **Step 1: Write failing reaction-feedback tests**

Add these tests inside `describe("createTelegramBot", () => { ... })` in `tests/adapters/telegramBot.test.js`:

```js
test("user reaction to a known bot message sends a feedback prompt", async () => {
  const controller = {
    sendPrompt: vi.fn(async (prompt) => {
      if (prompt === "hello") {
        return "answer"
      }
      return "feedback response"
    }),
  }
  const bot = createTelegramBot({
    token: "token",
    allowedUserId: 123,
    controller,
    logger: { warn: vi.fn(), error: vi.fn() },
    botFactory: FakeBot,
  })
  const reply = vi.fn(async (text) => ({ message_id: 11, chat: { id: 456 }, text }))
  const setMessageReaction = vi.fn(async () => true)

  await bot.messageHandlers.get("message:text")({
    message: { message_id: 10, text: "hello", chat: { id: 456 } },
    api: { sendChatAction: vi.fn(async () => undefined), setMessageReaction },
    reply,
  })

  const feedbackReply = vi.fn(async (text) => ({ message_id: 12, chat: { id: 456 }, text }))

  await bot.messageHandlers.get("message_reaction")({
    messageReaction: {
      chat: { id: 456 },
      message_id: 11,
      old_reaction: [],
      new_reaction: [{ type: "emoji", emoji: "👍" }],
    },
    reply: feedbackReply,
  })

  expect(controller.sendPrompt).toHaveBeenNthCalledWith(2, [
    "User reacted to one of your Telegram bot messages with 👍.",
    "",
    "Bot message:",
    "answer",
  ].join("\n"))
  expect(feedbackReply).toHaveBeenCalledWith("feedback response")
})

test("user reaction to an unknown bot message does nothing", async () => {
  const controller = {
    sendPrompt: vi.fn(async () => "answer"),
  }
  const bot = createTelegramBot({
    token: "token",
    allowedUserId: 123,
    controller,
    logger: { warn: vi.fn(), error: vi.fn() },
    botFactory: FakeBot,
  })

  await bot.messageHandlers.get("message_reaction")({
    messageReaction: {
      chat: { id: 456 },
      message_id: 999,
      old_reaction: [],
      new_reaction: [{ type: "emoji", emoji: "👍" }],
    },
    reply: vi.fn(async () => undefined),
  })

  expect(controller.sendPrompt).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run the focused adapter tests**

Run: `pnpm test tests/adapters/telegramBot.test.js`

Expected: FAIL because the adapter has no `message_reaction` handler and no bot message memory.

- [ ] **Step 3: Implement bounded bot message memory and tracked replies**

In `src/adapters/telegram/bot.js`, add this near the top of `createTelegramBot`:

```js
const botMessageMemory = createBotMessageMemory(200)
```

Add these helper functions near the other helpers:

```js
function createBotMessageMemory(limit) {
  const messages = new Map()

  return {
    remember(chatId, messageId, text) {
      if (!chatId || !messageId || typeof text !== "string") {
        return
      }
      const key = botMessageKey(chatId, messageId)
      messages.delete(key)
      messages.set(key, text)
      while (messages.size > limit) {
        messages.delete(messages.keys().next().value)
      }
    },

    get(chatId, messageId) {
      return messages.get(botMessageKey(chatId, messageId))
    },
  }
}

function botMessageKey(chatId, messageId) {
  return `${chatId}:${messageId}`
}

async function replyAndRemember(ctx, text, botMessageMemory, options) {
  const sentMessage = await ctx.reply(text, options)
  const chatId = sentMessage?.chat?.id ?? ctx.chat?.id ?? ctx.message?.chat?.id
  const messageId = sentMessage?.message_id
  botMessageMemory.remember(chatId, messageId, text)
  return sentMessage
}
```

Replace direct `ctx.reply(...)` calls in normal command/message paths with `replyAndRemember(ctx, ..., botMessageMemory, options)` where the sent text is a bot message that may receive reactions.

- [ ] **Step 4: Implement reaction update handler**

In `src/adapters/telegram/bot.js`, register a handler:

```js
bot.on("message_reaction", async (ctx) => {
  const update = ctx.messageReaction
  const botMessage = botMessageMemory.get(update.chat.id, update.message_id)
  if (!botMessage) {
    return
  }

  const addedEmojis = getAddedEmojiReactions(update.old_reaction, update.new_reaction)
  for (const emoji of addedEmojis) {
    const response = await controller.sendPrompt(formatReactionFeedbackPrompt(emoji, botMessage))
    const { visibleText } = parseTelegramReactionMarker(response)
    for (const chunk of chunkText(visibleText)) {
      await replyAndRemember(ctx, chunk, botMessageMemory)
    }
  }
})
```

Add helper functions:

```js
function getAddedEmojiReactions(oldReactions = [], newReactions = []) {
  const oldEmojis = new Set(oldReactions.filter((reaction) => reaction.type === "emoji").map((reaction) => reaction.emoji))
  return newReactions
    .filter((reaction) => reaction.type === "emoji" && !oldEmojis.has(reaction.emoji))
    .map((reaction) => reaction.emoji)
}

function formatReactionFeedbackPrompt(emoji, botMessage) {
  return [
    `User reacted to one of your Telegram bot messages with ${emoji}.`,
    "",
    "Bot message:",
    botMessage,
  ].join("\n")
}
```

- [ ] **Step 5: Run the focused adapter tests again**

Run: `pnpm test tests/adapters/telegramBot.test.js`

Expected: PASS.

## Task 4: Bound Bot Message Memory

**Files:**
- Modify: `tests/adapters/telegramBot.test.js`
- Modify: `src/adapters/telegram/bot.js` only if Task 3 did not already implement eviction correctly.

- [ ] **Step 1: Write the failing memory-bound test**

Add this test inside `describe("createTelegramBot", () => { ... })`:

```js
test("bot message memory evicts older messages", async () => {
  const controller = {
    sendPrompt: vi.fn(async (prompt) => `answer ${prompt}`),
  }
  const bot = createTelegramBot({
    token: "token",
    allowedUserId: 123,
    controller,
    logger: { warn: vi.fn(), error: vi.fn() },
    botFactory: FakeBot,
  })
  let nextReplyId = 100
  const reply = vi.fn(async (text) => ({ message_id: nextReplyId++, chat: { id: 456 }, text }))

  for (let index = 0; index < 201; index += 1) {
    await bot.messageHandlers.get("message:text")({
      message: { message_id: index + 1, text: String(index), chat: { id: 456 } },
      api: {
        sendChatAction: vi.fn(async () => undefined),
        setMessageReaction: vi.fn(async () => true),
      },
      reply,
    })
  }

  await bot.messageHandlers.get("message_reaction")({
    messageReaction: {
      chat: { id: 456 },
      message_id: 100,
      old_reaction: [],
      new_reaction: [{ type: "emoji", emoji: "👍" }],
    },
    reply: vi.fn(async () => undefined),
  })

  expect(controller.sendPrompt).toHaveBeenCalledTimes(201)
})
```

- [ ] **Step 2: Run the focused adapter tests**

Run: `pnpm test tests/adapters/telegramBot.test.js`

Expected: PASS if Task 3 implemented the `while (messages.size > limit)` eviction loop; otherwise FAIL and fix the eviction loop to match Task 3.

## Task 5: Full Verification

**Files:**
- All modified source, test, spec, and plan files.

- [ ] **Step 1: Run lint**

Run: `pnpm run lint`

Expected: PASS. If Biome reports formatting issues, run `pnpm run format`, inspect the diff, then run lint again.

- [ ] **Step 2: Run tests**

Run: `pnpm test`

Expected: PASS.

- [ ] **Step 3: Run full check**

Run: `pnpm run check`

Expected: PASS.

- [ ] **Step 4: Inspect final diff**

Run: `git diff -- src/adapters/telegram/bot.js src/runtime/bootstrap.js tests/adapters/telegramBot.test.js tests/runtime/bootstrap.test.js docs/superpowers/specs/2026-05-25-telegram-emoji-reactions-design.md docs/superpowers/plans/2026-05-25-telegram-emoji-reactions.md`

Expected: Diff only contains Telegram emoji reaction support, tests, and planning docs.

## Commit Guidance

Do not commit unless the user explicitly asks. If the user asks for a commit, inspect `git status`, `git diff`, and `git log --oneline -10`, then commit only the intended files with message `feat: add telegram emoji reactions`.

## Self-Review

Spec coverage: This plan covers temporary eye reactions, hidden OpenCode reaction markers, user reactions to any known bot message, unknown-message no-op behavior, bounded in-memory bot message storage, polling `allowed_updates`, and best-effort Telegram reaction failures.

Placeholder scan: The plan contains no placeholder tasks or deferred behavior.

Type consistency: The plan uses current grammY-style context fields already present in tests (`ctx.message`, `ctx.messageReaction`, `ctx.api`, `ctx.reply`) and current project functions (`createTelegramBot`, `controller.sendPrompt`, `chunkText`, `runGateway`).
