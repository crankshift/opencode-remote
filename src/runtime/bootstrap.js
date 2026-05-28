import {
  createTelegramBot as defaultCreateTelegramBot,
  registerTelegramBotCommands as defaultRegisterTelegramBotCommands,
} from "../adapters/telegram/bot.js"
import { openTelegramStickerStore as defaultOpenTelegramStickerStore } from "../adapters/telegram/stickerStore.js"
import { loadConfig } from "../config/loadConfig.js"
import { setConfigValuesAtPath as defaultSetConfigValuesAtPath } from "../config/writeConfig.js"
import { createGatewayContext } from "../core/gateway/context.js"
import { createGatewayController as defaultCreateGatewayController } from "../core/gateway/controller.js"
import { createOpenCodeClient as defaultCreateOpenCodeClient } from "../core/opencode/client.js"
import { ensureOpenCodeServer as defaultEnsureOpenCodeServer } from "../core/opencode/serverManager.js"
import { resolveProjectIdentity as defaultResolveProjectIdentity } from "../core/state/projectIdentity.js"
import { createProjectStateStore as defaultCreateProjectStateStore } from "../core/state/stateDb.js"
import { assertFfmpegAvailable as defaultAssertFfmpegAvailable } from "../core/voice/audioConverter.js"
import { createVoiceService as defaultCreateVoiceService } from "../core/voice/voiceService.js"
import { createLogger } from "../utils/logger.js"

export async function runGateway({
  config,
  stateSuffix,
  logger,
  dependencies = {},
  processLike = process,
} = {}) {
  const loadRuntimeConfig = dependencies.loadConfig ?? loadConfig
  const resolvedConfig = config ?? (await loadRuntimeConfig())
  const resolvedLogger = logger ?? createLogger(resolvedConfig.logLevel)
  const ensureOpenCodeServer = dependencies.ensureOpenCodeServer ?? defaultEnsureOpenCodeServer
  const createOpenCodeClient = dependencies.createOpenCodeClient ?? defaultCreateOpenCodeClient
  const resolveProjectIdentity =
    dependencies.resolveProjectIdentity ?? defaultResolveProjectIdentity
  const createProjectStateStore =
    dependencies.createProjectStateStore ?? defaultCreateProjectStateStore
  const createGatewayController =
    dependencies.createGatewayController ?? defaultCreateGatewayController
  const createTelegramBot = dependencies.createTelegramBot ?? defaultCreateTelegramBot
  const registerTelegramBotCommands =
    dependencies.registerTelegramBotCommands ?? defaultRegisterTelegramBotCommands
  const createVoiceService = dependencies.createVoiceService ?? defaultCreateVoiceService
  const openTelegramStickerStore =
    dependencies.openTelegramStickerStore ?? defaultOpenTelegramStickerStore
  const assertFfmpegAvailable = dependencies.assertFfmpegAvailable ?? defaultAssertFfmpegAvailable
  const setConfigValuesAtPath = dependencies.setConfigValuesAtPath ?? defaultSetConfigValuesAtPath

  if (resolvedConfig.voice.enabled && resolvedConfig.voice.mode !== "off") {
    await assertFfmpegAvailable()
  }

  const server = await ensureOpenCodeServer(resolvedConfig.opencode)
  const opencode = createOpenCodeClient({ apiUrl: resolvedConfig.opencode.apiUrl })
  const project = await resolveProjectIdentity({ directory: resolvedConfig.opencode.workdir })
  const store = createProjectStateStore({ project, ...(stateSuffix ? { stateSuffix } : {}) })
  const controller = createGatewayController({
    opencode,
    store,
    defaultProgressVerbosity: resolvedConfig.progressVerbosity,
    gatewayContext: createGatewayContext({
      voiceRepliesEnabled: resolvedConfig.voice.enabled && resolvedConfig.voice.mode !== "off",
    }),
    logger: resolvedLogger,
  })
  const voiceService = createVoiceService({
    config: resolvedConfig.voice,
    saveConfig: async (values) => {
      if (!resolvedConfig.configPath) {
        return
      }
      await setConfigValuesAtPath({
        configPath: resolvedConfig.configPath,
        cwd: resolvedConfig.opencode.workdir,
        values: prefixVoiceConfigValues(values),
      })
    },
  })
  const stickerStore = openTelegramStickerStore()
  const bot = createTelegramBot({
    token: resolvedConfig.telegram.botToken,
    allowedUserId: resolvedConfig.telegram.allowedUserId,
    controller,
    logger: resolvedLogger,
    progressVerbosity: resolvedConfig.progressVerbosity,
    voiceService,
    stickerStore,
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
    stickerStore.close?.()
  }

  processLike.once("SIGINT", shutdown)
  processLike.once("SIGTERM", shutdown)

  await registerTelegramBotCommands(bot, resolvedLogger)
  resolvedLogger.info("Starting Telegram polling")
  await bot.start({
    allowed_updates: ["message", "callback_query", "message_reaction"],
  })
}

function prefixVoiceConfigValues(values) {
  return Object.fromEntries(
    Object.entries(values ?? {}).map(([key, value]) => [`voice.${key}`, value]),
  )
}
