import { describe, expect, test, vi } from "vitest"
import { botCommands } from "../../src/core/commands/commands.js"
import { runGateway } from "../../src/runtime/bootstrap.js"

describe("runGateway", () => {
  test("loads config before creating runtime dependencies", async () => {
    const server = { stop: vi.fn(async () => undefined) }
    const bot = {
      api: { setMyCommands: vi.fn(async () => undefined) },
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
    }
    const loadConfig = vi.fn(async () => ({
      ...testConfig(),
      settingsPath: ".opencode-remote/settings.json",
    }))
    const project = { id: "project-1", worktree: "/project", vcs: "git" }
    const resolveProjectIdentity = vi.fn(async () => project)
    const createProjectStateStore = vi.fn(() => ({}))

    await runGateway({
      logger: testLogger(),
      dependencies: {
        loadConfig,
        ensureOpenCodeServer: vi.fn(async () => server),
        createOpenCodeClient: vi.fn(() => ({})),
        resolveProjectIdentity,
        createProjectStateStore,
        createGatewayController: vi.fn(() => ({})),
        createTelegramBot: vi.fn(() => bot),
      },
      processLike: { once: vi.fn() },
    })

    expect(loadConfig).toHaveBeenCalled()
    expect(resolveProjectIdentity).toHaveBeenCalledWith({
      directory: testConfig().opencode.workdir,
    })
    expect(createProjectStateStore).toHaveBeenCalledWith({ project })
  })

  test("passes the state suffix to the project state store", async () => {
    const server = { stop: vi.fn(async () => undefined) }
    const bot = {
      api: { setMyCommands: vi.fn(async () => undefined) },
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
    }
    const project = { id: "project-1", worktree: "/project", vcs: "git" }
    const createProjectStateStore = vi.fn(() => ({}))

    await runGateway({
      config: testConfig(),
      stateSuffix: "dev",
      logger: testLogger(),
      dependencies: {
        ensureOpenCodeServer: vi.fn(async () => server),
        createOpenCodeClient: vi.fn(() => ({})),
        resolveProjectIdentity: vi.fn(async () => project),
        createProjectStateStore,
        createGatewayController: vi.fn(() => ({})),
        createTelegramBot: vi.fn(() => bot),
      },
      processLike: { once: vi.fn() },
    })

    expect(createProjectStateStore).toHaveBeenCalledWith({ project, stateSuffix: "dev" })
  })

  test("starts OpenCode server before Telegram polling", async () => {
    const server = { stop: vi.fn(async () => undefined) }
    const bot = {
      api: { setMyCommands: vi.fn(async () => undefined) },
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
    }
    const ensureOpenCodeServer = vi.fn(async () => server)
    const createBot = vi.fn(() => bot)
    const processLike = { once: vi.fn() }

    await runGateway({
      config: testConfig(),
      logger: testLogger(),
      dependencies: {
        ensureOpenCodeServer,
        createOpenCodeClient: vi.fn(() => ({})),
        resolveProjectIdentity: vi.fn(async () => ({
          id: "project-1",
          worktree: "/project",
          vcs: "git",
        })),
        createProjectStateStore: vi.fn(() => ({})),
        createGatewayController: vi.fn(() => ({})),
        createTelegramBot: createBot,
      },
      processLike,
    })

    expect(ensureOpenCodeServer).toHaveBeenCalledWith(testConfig().opencode)
    expect(createBot).toHaveBeenCalledWith(
      expect.objectContaining({
        progressVerbosity: "all",
      }),
    )
    expect(bot.start).toHaveBeenCalledWith({
      allowed_updates: ["message", "callback_query", "message_reaction"],
    })
    expect(processLike.once).toHaveBeenCalledWith("SIGINT", expect.any(Function))
    expect(processLike.once).toHaveBeenCalledWith("SIGTERM", expect.any(Function))
  })

  test("registers Telegram commands before polling starts", async () => {
    const order = []
    const server = { stop: vi.fn(async () => undefined) }
    const bot = {
      api: {
        setMyCommands: vi.fn(async (_commands, options) => {
          order.push(options?.scope?.type ?? "default")
        }),
      },
      start: vi.fn(async () => {
        order.push("start")
      }),
      stop: vi.fn(async () => undefined),
    }

    await runGateway({
      config: testConfig(),
      logger: testLogger(),
      dependencies: {
        ensureOpenCodeServer: vi.fn(async () => server),
        createOpenCodeClient: vi.fn(() => ({})),
        resolveProjectIdentity: vi.fn(async () => ({
          id: "project-1",
          worktree: "/project",
          vcs: "git",
        })),
        createProjectStateStore: vi.fn(() => ({})),
        createGatewayController: vi.fn(() => ({})),
        createTelegramBot: vi.fn(() => bot),
      },
      processLike: { once: vi.fn() },
    })

    expect(bot.api.setMyCommands).toHaveBeenNthCalledWith(1, botCommands)
    expect(bot.api.setMyCommands).toHaveBeenNthCalledWith(2, botCommands, {
      scope: { type: "all_private_chats" },
    })
    expect(order).toEqual(["default", "all_private_chats", "start"])
  })

  test("starts polling when Telegram command registration fails", async () => {
    const logger = testLogger()
    const server = { stop: vi.fn(async () => undefined) }
    const error = new Error("telegram unavailable")
    const bot = {
      api: {
        setMyCommands: vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce(undefined),
      },
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
    }

    await runGateway({
      config: testConfig(),
      logger,
      dependencies: {
        ensureOpenCodeServer: vi.fn(async () => server),
        createOpenCodeClient: vi.fn(() => ({})),
        resolveProjectIdentity: vi.fn(async () => ({
          id: "project-1",
          worktree: "/project",
          vcs: "git",
        })),
        createProjectStateStore: vi.fn(() => ({})),
        createGatewayController: vi.fn(() => ({})),
        createTelegramBot: vi.fn(() => bot),
      },
      processLike: { once: vi.fn() },
    })

    expect(logger.warn).toHaveBeenCalledWith({ error }, "Could not register Telegram commands")
    expect(bot.api.setMyCommands).toHaveBeenNthCalledWith(1, botCommands)
    expect(bot.api.setMyCommands).toHaveBeenNthCalledWith(2, botCommands, {
      scope: { type: "all_private_chats" },
    })
    expect(bot.start).toHaveBeenCalledWith({
      allowed_updates: ["message", "callback_query", "message_reaction"],
    })
  })

  test("creates and passes the voice service to the Telegram bot", async () => {
    const server = { stop: vi.fn(async () => undefined) }
    const bot = {
      api: { setMyCommands: vi.fn(async () => undefined) },
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
    }
    const voiceService = { status: vi.fn() }
    const createVoiceService = vi.fn(() => voiceService)
    const createTelegramBot = vi.fn(() => bot)
    const config = testConfig()

    await runGateway({
      config,
      logger: testLogger(),
      dependencies: {
        ensureOpenCodeServer: vi.fn(async () => server),
        createOpenCodeClient: vi.fn(() => ({})),
        resolveProjectIdentity: vi.fn(async () => ({
          id: "project-1",
          worktree: "/project",
          vcs: "git",
        })),
        createProjectStateStore: vi.fn(() => ({})),
        createGatewayController: vi.fn(() => ({})),
        createVoiceService,
        createTelegramBot,
      },
      processLike: { once: vi.fn() },
    })

    expect(createVoiceService).toHaveBeenCalledWith(
      expect.objectContaining({
        config: config.voice,
        saveConfig: expect.any(Function),
      }),
    )
    expect(createTelegramBot).toHaveBeenCalledWith(expect.objectContaining({ voiceService }))
  })

  test("passes voice-aware gateway context to the controller", async () => {
    const logger = testLogger()
    const createGatewayController = vi.fn(() => ({}))
    const config = {
      ...testConfig(),
      voice: { ...testConfig().voice, enabled: true, mode: "all" },
    }

    await runGateway({
      config,
      logger,
      dependencies: {
        assertFfmpegAvailable: vi.fn(async () => undefined),
        ensureOpenCodeServer: vi.fn(async () => ({ stop: vi.fn() })),
        createOpenCodeClient: vi.fn(() => ({})),
        resolveProjectIdentity: vi.fn(async () => ({
          id: "project-1",
          worktree: "/project",
          vcs: "git",
        })),
        createProjectStateStore: vi.fn(() => ({})),
        createGatewayController,
        createVoiceService: vi.fn(() => ({})),
        createTelegramBot: vi.fn(() => ({
          api: { setMyCommands: vi.fn(async () => undefined) },
          start: vi.fn(async () => undefined),
          stop: vi.fn(async () => undefined),
        })),
      },
      processLike: { once: vi.fn() },
    })

    expect(createGatewayController).toHaveBeenCalledWith(
      expect.objectContaining({
        gatewayContext: expect.stringContaining("spoken voice note"),
        logger,
      }),
    )
  })

  test("requires ffmpeg before startup when voice is enabled", async () => {
    const assertFfmpegAvailable = vi.fn(async () => undefined)
    const config = {
      ...testConfig(),
      voice: { ...testConfig().voice, enabled: true, mode: "on" },
    }

    await runGateway({
      config,
      logger: testLogger(),
      dependencies: {
        assertFfmpegAvailable,
        ensureOpenCodeServer: vi.fn(async () => ({ stop: vi.fn() })),
        createOpenCodeClient: vi.fn(() => ({})),
        resolveProjectIdentity: vi.fn(async () => ({
          id: "project-1",
          worktree: "/project",
          vcs: "git",
        })),
        createProjectStateStore: vi.fn(() => ({})),
        createGatewayController: vi.fn(() => ({})),
        createTelegramBot: vi.fn(() => ({
          api: { setMyCommands: vi.fn(async () => undefined) },
          start: vi.fn(async () => undefined),
          stop: vi.fn(async () => undefined),
        })),
      },
      processLike: { once: vi.fn() },
    })

    expect(assertFfmpegAvailable).toHaveBeenCalled()
  })

  test("does not require ffmpeg when voice is disabled", async () => {
    const assertFfmpegAvailable = vi.fn(async () => undefined)

    await runGateway({
      config: testConfig(),
      logger: testLogger(),
      dependencies: {
        assertFfmpegAvailable,
        ensureOpenCodeServer: vi.fn(async () => ({ stop: vi.fn() })),
        createOpenCodeClient: vi.fn(() => ({})),
        resolveProjectIdentity: vi.fn(async () => ({
          id: "project-1",
          worktree: "/project",
          vcs: "git",
        })),
        createProjectStateStore: vi.fn(() => ({})),
        createGatewayController: vi.fn(() => ({})),
        createTelegramBot: vi.fn(() => ({
          api: { setMyCommands: vi.fn(async () => undefined) },
          start: vi.fn(async () => undefined),
          stop: vi.fn(async () => undefined),
        })),
      },
      processLike: { once: vi.fn() },
    })

    expect(assertFfmpegAvailable).not.toHaveBeenCalled()
  })

  test("registered shutdown stops Telegram polling and owned server", async () => {
    const server = { stop: vi.fn(async () => undefined) }
    const bot = {
      api: { setMyCommands: vi.fn(async () => undefined) },
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
    }
    const handlers = new Map()
    const processLike = { once: vi.fn((signal, handler) => handlers.set(signal, handler)) }

    await runGateway({
      config: testConfig(),
      logger: testLogger(),
      dependencies: {
        ensureOpenCodeServer: vi.fn(async () => server),
        createOpenCodeClient: vi.fn(() => ({})),
        resolveProjectIdentity: vi.fn(async () => ({
          id: "project-1",
          worktree: "/project",
          vcs: "git",
        })),
        createProjectStateStore: vi.fn(() => ({})),
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
    progressVerbosity: "all",
    voice: {
      enabled: false,
      mode: "on",
      voice: "en-US-AndrewNeural",
      groqApiKey: null,
      sttModel: "whisper-large-v3-turbo",
    },
  }
}

function testLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
  }
}
