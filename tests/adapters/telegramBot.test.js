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
  test("registers v1 commands and text handler", () => {
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
})
