import { describe, expect, test, vi } from "vitest"
import { privateBotCommands, publicBotCommands } from "../../src/core/commands/commands.js"
import {
  runGateway as runGatewayBase,
  startTelegramBotWithRunner,
} from "../../src/runtime/bootstrap.js"

describe("runGateway", () => {
  test("starts Telegram polling with concurrent grammY runner options", () => {
    const bot = {}
    const runner = { stop: vi.fn(), task: vi.fn() }
    const runTelegramBot = vi.fn(() => runner)

    const result = startTelegramBotWithRunner(bot, {
      allowedUpdates: ["message", "callback_query"],
      runTelegramBot,
    })

    expect(result).toBe(runner)
    expect(runTelegramBot).toHaveBeenCalledWith(bot, {
      runner: { fetch: { allowed_updates: ["message", "callback_query"] } },
    })
  })

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
    expect(createProjectStateStore).toHaveBeenCalledWith(
      expect.objectContaining({ project, logger: expect.any(Object) }),
    )
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

    expect(createProjectStateStore).toHaveBeenCalledWith(
      expect.objectContaining({ project, stateSuffix: "dev", logger: expect.any(Object) }),
    )
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
    const startTelegramPolling = vi.fn(() => createTelegramRunner())
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
        startTelegramPolling,
      },
      processLike,
    })

    expect(ensureOpenCodeServer).toHaveBeenCalledWith(
      expect.objectContaining({ ...testConfig().opencode, logger: expect.any(Object) }),
    )
    expect(createBot).toHaveBeenCalledWith(
      expect.objectContaining({
        telegram: testConfig().telegram,
        progressVerbosity: "all",
      }),
    )
    expect(startTelegramPolling).toHaveBeenCalledWith(bot, {
      allowedUpdates: ["message", "callback_query", "message_reaction", "my_chat_member"],
    })
    expect(processLike.once).toHaveBeenCalledWith("SIGINT", expect.any(Function))
    expect(processLike.once).toHaveBeenCalledWith("SIGTERM", expect.any(Function))
  })

  test("passes bundled meme runtime wrappers scoped to the resolved OpenCode workdir", async () => {
    const bot = {
      api: { setMyCommands: vi.fn(async () => undefined) },
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
    }
    const createTelegramBot = vi.fn(() => bot)
    const bundledMemeRuntimeStatus = vi.fn(async () => ({ enabled: true }))
    const installBundledMemeRuntimeForProject = vi.fn(async () => ({ writtenPaths: [] }))
    const createGeneratedSkill = vi.fn(async (input) => ({
      skillName: input.name,
      filePath: "safe",
    }))
    const config = {
      ...testConfig(),
      opencode: { ...testConfig().opencode, workdir: "/resolved/workdir" },
    }

    await runGateway({
      config,
      logger: testLogger(),
      dependencies: {
        ensureOpenCodeServer: vi.fn(async () => ({ stop: vi.fn() })),
        createOpenCodeClient: vi.fn(() => ({})),
        resolveProjectIdentity: vi.fn(async () => ({
          id: "project-1",
          worktree: "/resolved/workdir",
          vcs: "git",
        })),
        createProjectStateStore: vi.fn(() => ({})),
        createGatewayController: vi.fn(() => ({})),
        createTelegramBot,
        bundledMemeRuntimeStatus,
        installBundledMemeRuntimeForProject,
        createGeneratedSkill,
      },
      processLike: { once: vi.fn() },
    })

    const botOptions = createTelegramBot.mock.calls[0][0]
    await botOptions.bundledMemeRuntimeStatus()
    await botOptions.installBundledMemeRuntimeForProject()
    await botOptions.createGeneratedSkill({ name: "demo", body: "body" })

    expect(bundledMemeRuntimeStatus).toHaveBeenCalledWith({ projectRoot: "/resolved/workdir" })
    expect(installBundledMemeRuntimeForProject).toHaveBeenCalledWith({
      projectRoot: "/resolved/workdir",
    })
    expect(createGeneratedSkill).toHaveBeenCalledWith({
      projectRoot: "/resolved/workdir",
      name: "demo",
      body: "body",
    })
  })

  test("logs safe startup milestones", async () => {
    const logger = testLogger()
    const server = { started: false, stop: vi.fn(async () => undefined) }
    const bot = {
      api: { setMyCommands: vi.fn(async () => undefined) },
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
          worktree: "/private/project",
          vcs: "git",
        })),
        createProjectStateStore: vi.fn(() => ({})),
        createGatewayController: vi.fn(() => ({})),
        createTelegramBot: vi.fn(() => bot),
      },
      processLike: { once: vi.fn() },
    })

    expect(logger.debug).toHaveBeenCalledWith(
      {
        hasConfigPath: false,
        logLevel: "silent",
        progressVerbosity: "all",
        voiceEnabled: false,
        voiceMode: "on",
      },
      "Gateway config resolved",
    )
    expect(logger.debug).toHaveBeenCalledWith(
      { opencodeServerStarted: false },
      "OpenCode server ready",
    )
    expect(logger.debug).toHaveBeenCalledWith(
      { projectScoped: true, vcs: "git" },
      "Project identity resolved",
    )
    expect(logger.debug).toHaveBeenCalledWith(
      { allowedUpdates: ["message", "callback_query", "message_reaction", "my_chat_member"] },
      "Telegram polling starting",
    )
    for (const [metadata] of logger.debug.mock.calls) {
      expect(metadata).not.toHaveProperty("workdir")
      expect(metadata).not.toHaveProperty("configPath")
      expect(metadata).not.toHaveProperty("botToken")
    }
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

    expect(bot.api.setMyCommands).toHaveBeenNthCalledWith(1, publicBotCommands)
    expect(bot.api.setMyCommands).toHaveBeenNthCalledWith(2, privateBotCommands, {
      scope: { type: "all_private_chats" },
    })
    expect(order).toEqual(["default", "all_private_chats", "start"])
  })

  test("starts polling when Telegram command registration fails", async () => {
    const logger = testLogger()
    const server = { stop: vi.fn(async () => undefined) }
    const error = new Error("telegram unavailable")
    const startTelegramPolling = vi.fn(() => createTelegramRunner())
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
        startTelegramPolling,
      },
      processLike: { once: vi.fn() },
    })

    expect(logger.warn).toHaveBeenCalledWith({ error }, "Could not register Telegram commands")
    expect(bot.api.setMyCommands).toHaveBeenNthCalledWith(1, publicBotCommands)
    expect(bot.api.setMyCommands).toHaveBeenNthCalledWith(2, privateBotCommands, {
      scope: { type: "all_private_chats" },
    })
    expect(startTelegramPolling).toHaveBeenCalledWith(bot, {
      allowedUpdates: ["message", "callback_query", "message_reaction", "my_chat_member"],
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

  test("creates and passes the Telegram sticker store to the Telegram bot", async () => {
    const server = { stop: vi.fn(async () => undefined) }
    const bot = {
      api: { setMyCommands: vi.fn(async () => undefined) },
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
    }
    const stickerStore = { close: vi.fn() }
    const openTelegramStickerStore = vi.fn(() => stickerStore)
    const createTelegramBot = vi.fn(() => bot)

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
        openTelegramStickerStore,
        createTelegramBot,
      },
      processLike: { once: vi.fn() },
    })

    expect(openTelegramStickerStore).toHaveBeenCalledWith()
    expect(createTelegramBot).toHaveBeenCalledWith(expect.objectContaining({ stickerStore }))
  })

  test("creates group store and refreshes known allowed groups before polling", async () => {
    const order = []
    const server = { stop: vi.fn(async () => undefined) }
    const bot = {
      api: { setMyCommands: vi.fn(async () => undefined) },
      start: vi.fn(async () => {
        order.push("start")
      }),
      stop: vi.fn(async () => undefined),
    }
    const groupStore = { close: vi.fn() }
    const registry = {
      setApi: vi.fn(),
      refreshAllowedGroups: vi.fn(async () => {
        order.push("refresh")
      }),
    }
    const openTelegramGroupStore = vi.fn(() => groupStore)
    const createTelegramGroupRegistry = vi.fn(() => registry)
    const createTelegramBot = vi.fn(() => bot)

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
        openTelegramGroupStore,
        createTelegramGroupRegistry,
        createTelegramBot,
      },
      processLike: { once: vi.fn() },
    })

    expect(openTelegramGroupStore).toHaveBeenCalledWith()
    expect(createTelegramGroupRegistry).toHaveBeenCalledWith(
      expect.objectContaining({
        telegram: testConfig().telegram,
        store: groupStore,
      }),
    )
    expect(registry.setApi).toHaveBeenCalledWith(bot.api)
    expect(createTelegramBot).toHaveBeenCalledWith(
      expect.objectContaining({ groupStore, groupRegistry: registry }),
    )
    expect(order).toEqual(["refresh", "start"])
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
    const stickerStore = { close: vi.fn() }
    const groupStore = { close: vi.fn() }
    const bot = {
      api: { setMyCommands: vi.fn(async () => undefined) },
      start: vi.fn(async () => undefined),
      stop: vi.fn(async () => undefined),
    }
    const runner = createTelegramRunner()
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
        openTelegramStickerStore: vi.fn(() => stickerStore),
        openTelegramGroupStore: vi.fn(() => groupStore),
        createTelegramBot: vi.fn(() => bot),
        startTelegramPolling: vi.fn(() => runner),
      },
      processLike,
    })

    await handlers.get("SIGINT")("SIGINT")

    expect(runner.stop).toHaveBeenCalled()
    expect(server.stop).toHaveBeenCalled()
    expect(stickerStore.close).toHaveBeenCalled()
    expect(groupStore.close).toHaveBeenCalled()
  })
})

function runGateway(options = {}) {
  const dependencies = options.dependencies ?? {}
  const startTelegramPolling =
    dependencies.startTelegramPolling ??
    vi.fn((bot, { allowedUpdates } = {}) => {
      bot.start?.({ allowed_updates: allowedUpdates })
      return createTelegramRunner()
    })

  return runGatewayBase({
    ...options,
    dependencies: { ...dependencies, startTelegramPolling },
  })
}

function createTelegramRunner() {
  return {
    stop: vi.fn(async () => undefined),
    task: vi.fn(async () => undefined),
  }
}

function testConfig() {
  return {
    schemaVersion: 2,
    telegram: { botToken: "token", allowedUserIds: [123], allowedChatIds: [] },
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
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }
}
