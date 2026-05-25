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
  config = loadConfig(),
  logger = createLogger(config.logLevel),
  dependencies = {},
  processLike = process,
} = {}) {
  const ensureOpenCodeServer = dependencies.ensureOpenCodeServer ?? defaultEnsureOpenCodeServer
  const createOpenCodeClient = dependencies.createOpenCodeClient ?? defaultCreateOpenCodeClient
  const createSettingsStore = dependencies.createSettingsStore ?? defaultCreateSettingsStore
  const createGatewayController =
    dependencies.createGatewayController ?? defaultCreateGatewayController
  const createTelegramBot = dependencies.createTelegramBot ?? defaultCreateTelegramBot
  const registerTelegramBotCommands =
    dependencies.registerTelegramBotCommands ?? defaultRegisterTelegramBotCommands

  const server = await ensureOpenCodeServer(config.opencode)
  const opencode = createOpenCodeClient({ apiUrl: config.opencode.apiUrl })
  const store = createSettingsStore(config.settingsPath)
  const controller = createGatewayController({
    opencode,
    store,
    defaultProgressVerbosity: config.progressVerbosity,
  })
  const bot = createTelegramBot({
    token: config.telegram.botToken,
    allowedUserId: config.telegram.allowedUserId,
    controller,
    logger,
    progressVerbosity: config.progressVerbosity,
  })

  let stopping = false
  async function shutdown(signal) {
    if (stopping) {
      return
    }
    stopping = true
    logger.info({ signal }, "Shutting down gateway")
    await bot.stop()
    await server.stop()
  }

  processLike.once("SIGINT", shutdown)
  processLike.once("SIGTERM", shutdown)

  await registerTelegramBotCommands(bot, logger)
  logger.info("Starting Telegram polling")
  await bot.start({
    allowed_updates: ["message", "callback_query", "message_reaction"],
  })
}
