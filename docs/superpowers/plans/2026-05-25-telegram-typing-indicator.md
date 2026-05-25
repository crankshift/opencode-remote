# Telegram Typing Indicator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the visible "Sending prompt to OpenCode..." message with Telegram's `typing` chat action while an OpenCode prompt is processing.

**Architecture:** Keep the behavior in the Telegram adapter because chat actions are messenger-specific UX. The core gateway controller remains unchanged and continues to expose `sendPrompt(prompt)`. The adapter starts and stops a small typing loop around the existing prompt call.

**Tech Stack:** JavaScript, Node.js 22+, grammY `ctx.api.sendChatAction`, Vitest.

---

### Task 1: Telegram Prompt Typing Indicator

**Files:**
- Modify: `tests/adapters/telegramBot.test.js`
- Modify: `src/adapters/telegram/bot.js`

- [ ] **Step 1: Write the failing test**

Add this test to `tests/adapters/telegramBot.test.js` inside `describe("createTelegramBot", () => { ... })`:

```js
  test("text prompts show typing instead of sending a status reply", async () => {
    vi.useFakeTimers()
    const controller = {
      sendPrompt: vi.fn(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve("answer"), 4100)
          }),
      ),
    }
    const bot = createTelegramBot({
      token: "token",
      allowedUserId: 123,
      controller,
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })
    const reply = vi.fn(async () => undefined)
    const sendChatAction = vi.fn(async () => undefined)

    const handling = bot.messageHandlers.get("message:text")({
      message: { text: "hello", chat: { id: 456 } },
      api: { sendChatAction },
      reply,
    })

    await vi.advanceTimersByTimeAsync(4100)
    await handling

    expect(reply).not.toHaveBeenCalledWith("Sending prompt to OpenCode...")
    expect(sendChatAction).toHaveBeenCalledTimes(2)
    expect(sendChatAction).toHaveBeenNthCalledWith(1, 456, "typing")
    expect(sendChatAction).toHaveBeenNthCalledWith(2, 456, "typing")
    expect(reply).toHaveBeenCalledWith("answer")
    vi.useRealTimers()
  })
```

- [ ] **Step 2: Run the targeted test and verify it fails**

Run: `pnpm test tests/adapters/telegramBot.test.js`

Expected: FAIL because the current text handler sends `"Sending prompt to OpenCode..."` and does not call `sendChatAction`.

- [ ] **Step 3: Implement the typing action loop**

In `src/adapters/telegram/bot.js`, replace the text prompt handler with:

```js
  bot.on("message:text", async (ctx) => {
    if (ctx.message.text.startsWith("/")) {
      return
    }

    const stopTyping = startTypingIndicator(ctx, logger)
    try {
      const response = await controller.sendPrompt(ctx.message.text)
      for (const chunk of chunkText(response)) {
        await ctx.reply(chunk)
      }
    } finally {
      stopTyping()
    }
  })
```

Add this helper below `formatSessionLabel` in the same file:

```js
function startTypingIndicator(ctx, logger) {
  const chatId = ctx.message?.chat?.id
  if (!chatId || !ctx.api?.sendChatAction) {
    return () => undefined
  }

  const sendTyping = () => {
    ctx.api.sendChatAction(chatId, "typing").catch((error) => {
      logger.warn({ error }, "Could not send Telegram typing action")
    })
  }

  sendTyping()
  const interval = setInterval(sendTyping, 4000)
  return () => clearInterval(interval)
}
```

- [ ] **Step 4: Run the targeted test and verify it passes**

Run: `pnpm test tests/adapters/telegramBot.test.js`

Expected: PASS for all tests in `tests/adapters/telegramBot.test.js`.

- [ ] **Step 5: Run full verification**

Run: `pnpm run lint`

Expected: PASS.

Run: `pnpm test`

Expected: PASS.

Run: `pnpm run check`

Expected: PASS.

- [ ] **Step 6: Commit gate**

Do not commit unless the user explicitly asks. If the user asks for a commit, inspect `git status`, `git diff`, and `git log --oneline -10`, then commit only these files with message `feat: show telegram typing while prompts run`:

```bash
git add src/adapters/telegram/bot.js tests/adapters/telegramBot.test.js docs/superpowers/plans/2026-05-25-telegram-typing-indicator.md
git commit -m "feat: show telegram typing while prompts run"
```

## Self-Review

Spec coverage: The plan removes the status reply, adds Telegram typing during prompt processing, keeps it visible beyond Telegram's short chat-action lifetime, and verifies the behavior with a test.

Placeholder scan: No TBD, TODO, or unspecified implementation steps remain.

Type consistency: The test and implementation both use `ctx.message.chat.id`, `ctx.api.sendChatAction(chatId, "typing")`, and the existing `controller.sendPrompt(prompt)` signature.
