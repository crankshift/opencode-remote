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
})
