import {
  createTelegramBot as defaultCreateTelegramBot,
  registerTelegramBotCommands as defaultRegisterTelegramBotCommands,
} from "../adapters/telegram/bot.js"
import { loadConfig } from "../config/loadConfig.js"
import { createGatewayController as defaultCreateGatewayController } from "../core/gateway/controller.js"
import { createOpenCodeClient as defaultCreateOpenCodeClient } from "../core/opencode/client.js"
import { ensureOpenCodeServer as defaultEnsureOpenCodeServer } from "../core/opencode/serverManager.js"
import { createSettingsStore as defaultCreateSettingsStore } from "../core/session/settingsStore.js"
import { createLogger } from "../utils/logger.js"

export async function runGateway({
  config,
  logger,
  dependencies = {},
  processLike = process,
} = {}) {
  const loadRuntimeConfig = dependencies.loadConfig ?? loadConfig
  const resolvedConfig = config ?? (await loadRuntimeConfig())
  const resolvedLogger = logger ?? createLogger(resolvedConfig.logLevel)
  const ensureOpenCodeServer = dependencies.ensureOpenCodeServer ?? defaultEnsureOpenCodeServer
  const createOpenCodeClient = dependencies.createOpenCodeClient ?? defaultCreateOpenCodeClient
  const createSettingsStore = dependencies.createSettingsStore ?? defaultCreateSettingsStore
  const createGatewayController =
    dependencies.createGatewayController ?? defaultCreateGatewayController
  const createTelegramBot = dependencies.createTelegramBot ?? defaultCreateTelegramBot
  const registerTelegramBotCommands =
    dependencies.registerTelegramBotCommands ?? defaultRegisterTelegramBotCommands

  const server = await ensureOpenCodeServer(resolvedConfig.opencode)
  const opencode = createOpenCodeClient({ apiUrl: resolvedConfig.opencode.apiUrl })
  const store = createSettingsStore(resolvedConfig.settingsPath)
  const controller = createGatewayController({
    opencode,
    store,
    defaultProgressVerbosity: resolvedConfig.progressVerbosity,
  })
  const bot = createTelegramBot({
    token: resolvedConfig.telegram.botToken,
    allowedUserId: resolvedConfig.telegram.allowedUserId,
    controller,
    logger: resolvedLogger,
    progressVerbosity: resolvedConfig.progressVerbosity,
  })

  let stopping = false
  async function shutdown(signal) {
    if (stopping) {
      return
    }
    stopping = true
    resolvedLogger.info({ signal }, "Shutting down gateway")
    await bot.stop()
    await server.stop()
  }

  processLike.once("SIGINT", shutdown)
  processLike.once("SIGTERM", shutdown)

  await registerTelegramBotCommands(bot, resolvedLogger)
  resolvedLogger.info("Starting Telegram polling")
  await bot.start({
    allowed_updates: ["message", "callback_query", "message_reaction"],
  })
}
