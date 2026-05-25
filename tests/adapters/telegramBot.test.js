import { describe, expect, test, vi } from "vitest"
import { createTelegramBot } from "../../src/adapters/telegram/bot.js"

class FakeBot {
  constructor(token) {
    this.token = token
    this.api = { setMyCommands: vi.fn(async () => undefined) }
    this.middlewares = []
    this.commands = new Map()
    this.callbackHandlers = []
    this.messageHandlers = new Map()
    this.errorHandler = null
  }

  use(handler) {
    this.middlewares.push(handler)
  }

  command(name, handler) {
    this.commands.set(name, handler)
  }

  callbackQuery(pattern, handler) {
    this.callbackHandlers.push({ pattern, handler })
  }

  on(eventName, handler) {
    this.messageHandlers.set(eventName, handler)
  }

  catch(handler) {
    this.errorHandler = handler
  }
}

describe("createTelegramBot", () => {
  test("registers v1 commands and message handlers", () => {
    const bot = createTelegramBot({
      token: "token",
      allowedUserId: 123,
      controller: {},
      logger: { warn: vi.fn() },
      botFactory: FakeBot,
    })

    expect(bot.token).toBe("token")
    expect([...bot.commands.keys()]).toEqual(["help", "status", "new", "sessions", "stop"])
    expect(bot.messageHandlers.has("message:text")).toBe(true)
    expect(bot.messageHandlers.has("message_reaction")).toBe(true)
    expect(bot.errorHandler).toEqual(expect.any(Function))
    expect(bot.api.setMyCommands).toHaveBeenCalledWith([
      { command: "status", description: "Show gateway and OpenCode status" },
      { command: "new", description: "Create and select a new OpenCode session" },
      { command: "sessions", description: "List and switch OpenCode sessions" },
      { command: "stop", description: "Abort current OpenCode task" },
      { command: "help", description: "Show available commands" },
    ])
  })

  test("authorization middleware stops unauthorized updates", async () => {
    const logger = { warn: vi.fn() }
    const bot = createTelegramBot({
      token: "token",
      allowedUserId: 123,
      controller: {},
      logger,
      botFactory: FakeBot,
    })
    const next = vi.fn()

    await bot.middlewares[0]({ from: { id: 999 } }, next)

    expect(next).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalled()
  })

  test("error handler logs and sends a safe reply", async () => {
    const logger = { warn: vi.fn(), error: vi.fn() }
    const bot = createTelegramBot({
      token: "token",
      allowedUserId: 123,
      controller: {},
      logger,
      botFactory: FakeBot,
    })
    const reply = vi.fn(async () => undefined)

    await bot.errorHandler({ ctx: { reply }, error: new Error("secret stack") })

    expect(logger.error).toHaveBeenCalled()
    expect(reply).toHaveBeenCalledWith("OpenCode Gateway failed while handling that request.")
  })

  test("sessions command truncates labels and uses bounded callback data", async () => {
    const longTitle = "a".repeat(120)
    const longId = "ses_".padEnd(120, "x")
    const bot = createTelegramBot({
      token: "token",
      allowedUserId: 123,
      controller: {
        listSessions: vi.fn(async () => [{ id: longId, title: longTitle }]),
      },
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })
    const reply = vi.fn(async () => undefined)

    await bot.commands.get("sessions")({ reply })

    const keyboard = reply.mock.calls[0][1].reply_markup.inline_keyboard
    const button = keyboard[0][0]
    expect(button.text.length).toBeLessThanOrEqual(64)
    expect(button.callback_data).toBe("session:0")
  })

  test("session callback resolves bounded callback data to stored session ID", async () => {
    const longId = "ses_".padEnd(120, "x")
    const controller = {
      listSessions: vi.fn(async () => [{ id: longId, title: "Session" }]),
      selectSession: vi.fn(async () => undefined),
    }
    const bot = createTelegramBot({
      token: "token",
      allowedUserId: 123,
      controller,
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })

    await bot.commands.get("sessions")({ reply: vi.fn(async () => undefined) })
    await bot.callbackHandlers[0].handler({
      match: ["session:0", "0"],
      answerCallbackQuery: vi.fn(async () => undefined),
      reply: vi.fn(async () => undefined),
    })

    expect(controller.selectSession).toHaveBeenCalledWith(longId)
  })

  test("stop command reports when there is no active session", async () => {
    const bot = createTelegramBot({
      token: "token",
      allowedUserId: 123,
      controller: {
        stop: vi.fn(async () => ({ stopped: false, reason: "no_active_session" })),
      },
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })
    const reply = vi.fn(async () => undefined)

    await bot.commands.get("stop")({ reply })

    expect(reply).toHaveBeenCalledWith("No active OpenCode session to stop.")
  })

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

    expect(setMessageReaction).toHaveBeenNthCalledWith(1, 456, 10, [{ type: "emoji", emoji: "👀" }])
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
    expect(setMessageReaction).toHaveBeenNthCalledWith(1, 456, 10, [{ type: "emoji", emoji: "👀" }])
    expect(setMessageReaction).toHaveBeenNthCalledWith(2, 456, 10, [])
    expect(setMessageReaction).toHaveBeenNthCalledWith(3, 456, 10, [{ type: "emoji", emoji: "👍" }])
  })

  test("user reaction to a known bot message sends a feedback prompt and reply", async () => {
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

    expect(controller.sendPrompt).toHaveBeenNthCalledWith(
      2,
      [
        "User reacted to one of your Telegram bot messages with 👍.",
        "",
        "Bot message:",
        "answer",
      ].join("\n"),
    )
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
})
