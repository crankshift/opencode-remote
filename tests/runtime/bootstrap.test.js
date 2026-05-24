import { describe, expect, test, vi } from "vitest"
import { runGateway } from "../../src/runtime/bootstrap.js"

describe("runGateway", () => {
  test("starts OpenCode server before Telegram polling", async () => {
    const server = { stop: vi.fn(async () => undefined) }
    const bot = { start: vi.fn(async () => undefined), stop: vi.fn(async () => undefined) }
    const ensureOpenCodeServer = vi.fn(async () => server)
    const createBot = vi.fn(() => bot)
    const processLike = { once: vi.fn() }

    await runGateway({
      config: testConfig(),
      logger: testLogger(),
      dependencies: {
        ensureOpenCodeServer,
        createOpenCodeClient: vi.fn(() => ({})),
        createSettingsStore: vi.fn(() => ({})),
        createGatewayController: vi.fn(() => ({})),
        createTelegramBot: createBot,
      },
      processLike,
    })

    expect(ensureOpenCodeServer).toHaveBeenCalledWith(testConfig().opencode)
    expect(createBot).toHaveBeenCalled()
    expect(bot.start).toHaveBeenCalled()
    expect(processLike.once).toHaveBeenCalledWith("SIGINT", expect.any(Function))
    expect(processLike.once).toHaveBeenCalledWith("SIGTERM", expect.any(Function))
  })

  test("registered shutdown stops Telegram polling and owned server", async () => {
    const server = { stop: vi.fn(async () => undefined) }
    const bot = { start: vi.fn(async () => undefined), stop: vi.fn(async () => undefined) }
    const handlers = new Map()
    const processLike = { once: vi.fn((signal, handler) => handlers.set(signal, handler)) }

    await runGateway({
      config: testConfig(),
      logger: testLogger(),
      dependencies: {
        ensureOpenCodeServer: vi.fn(async () => server),
        createOpenCodeClient: vi.fn(() => ({})),
        createSettingsStore: vi.fn(() => ({})),
        createGatewayController: vi.fn(() => ({})),
        createTelegramBot: vi.fn(() => bot),
      },
      processLike,
    })

    await handlers.get("SIGINT")("SIGINT")

    expect(bot.stop).toHaveBeenCalled()
    expect(server.stop).toHaveBeenCalled()
  })
})

function testConfig() {
  return {
    telegram: { botToken: "token", allowedUserId: 123 },
    opencode: {
      apiUrl: "http://localhost:4096",
      command: "opencode",
      autoStart: true,
      workdir: process.cwd(),
    },
    logLevel: "silent",
    settingsPath: ".data/settings.json",
  }
}

function testLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
  }
}
