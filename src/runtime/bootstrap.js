import { run as defaultRunTelegramBot } from "@grammyjs/runner"
import {
  createTelegramBot as defaultCreateTelegramBot,
  registerTelegramBotCommands as defaultRegisterTelegramBotCommands,
} from "../adapters/telegram/bot.js"
import { createTelegramGroupRegistry as defaultCreateTelegramGroupRegistry } from "../adapters/telegram/groupRegistry.js"
import { openTelegramGroupStore as defaultOpenTelegramGroupStore } from "../adapters/telegram/groupStore.js"
import { openTelegramStickerStore as defaultOpenTelegramStickerStore } from "../adapters/telegram/stickerStore.js"
import { loadConfig } from "../config/loadConfig.js"
import { setConfigValuesAtPath as defaultSetConfigValuesAtPath } from "../config/writeConfig.js"
import { createGatewayContext } from "../core/gateway/context.js"
import { createGatewayController as defaultCreateGatewayController } from "../core/gateway/controller.js"
import {
  bundledMemeRuntimeStatus as defaultBundledMemeRuntimeStatus,
  installBundledMemeRuntimeForProject as defaultInstallBundledMemeRuntimeForProject,
} from "../core/opencode/bundledRuntimeAssets.js"
import { createOpenCodeClient as defaultCreateOpenCodeClient } from "../core/opencode/client.js"
import { createGeneratedSkill as defaultCreateGeneratedSkill } from "../core/opencode/generatedSkills.js"
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
  resolvedLogger.debug?.(
    {
      hasConfigPath: Boolean(resolvedConfig.configPath),
      logLevel: resolvedConfig.logLevel,
      progressVerbosity: resolvedConfig.progressVerbosity,
      voiceEnabled: resolvedConfig.voice.enabled,
      voiceMode: resolvedConfig.voice.mode,
    },
    "Gateway config resolved",
  )
  const ensureOpenCodeServer = dependencies.ensureOpenCodeServer ?? defaultEnsureOpenCodeServer
  const createOpenCodeClient = dependencies.createOpenCodeClient ?? defaultCreateOpenCodeClient
  const resolveProjectIdentity =
    dependencies.resolveProjectIdentity ?? defaultResolveProjectIdentity
  const createProjectStateStore =
    dependencies.createProjectStateStore ?? defaultCreateProjectStateStore
  const createGatewayController =
    dependencies.createGatewayController ?? defaultCreateGatewayController
  const createTelegramBot = dependencies.createTelegramBot ?? defaultCreateTelegramBot
  const startTelegramPolling = dependencies.startTelegramPolling ?? startTelegramBotWithRunner
  const registerTelegramBotCommands =
    dependencies.registerTelegramBotCommands ?? defaultRegisterTelegramBotCommands
  const createVoiceService = dependencies.createVoiceService ?? defaultCreateVoiceService
  const openTelegramStickerStore =
    dependencies.openTelegramStickerStore ?? defaultOpenTelegramStickerStore
  const openTelegramGroupStore =
    dependencies.openTelegramGroupStore ?? defaultOpenTelegramGroupStore
  const createTelegramGroupRegistry =
    dependencies.createTelegramGroupRegistry ?? defaultCreateTelegramGroupRegistry
  const assertFfmpegAvailable = dependencies.assertFfmpegAvailable ?? defaultAssertFfmpegAvailable
  const setConfigValuesAtPath = dependencies.setConfigValuesAtPath ?? defaultSetConfigValuesAtPath
  const bundledMemeRuntimeStatus =
    dependencies.bundledMemeRuntimeStatus ?? defaultBundledMemeRuntimeStatus
  const installBundledMemeRuntimeForProject =
    dependencies.installBundledMemeRuntimeForProject ?? defaultInstallBundledMemeRuntimeForProject
  const createGeneratedSkill = dependencies.createGeneratedSkill ?? defaultCreateGeneratedSkill

  if (resolvedConfig.voice.enabled && resolvedConfig.voice.mode !== "off") {
    resolvedLogger.debug?.({ voiceMode: resolvedConfig.voice.mode }, "Checking voice dependencies")
    await assertFfmpegAvailable()
  }

  const server = await ensureOpenCodeServer({ ...resolvedConfig.opencode, logger: resolvedLogger })
  resolvedLogger.debug?.(
    { opencodeServerStarted: server.started === true },
    "OpenCode server ready",
  )
  const opencode = createOpenCodeClient({ apiUrl: resolvedConfig.opencode.apiUrl })
  const project = await resolveProjectIdentity({ directory: resolvedConfig.opencode.workdir })
  resolvedLogger.debug?.(
    { projectScoped: project.id !== "global", vcs: project.vcs ?? null },
    "Project identity resolved",
  )
  const store = createProjectStateStore({
    project,
    logger: resolvedLogger,
    ...(stateSuffix ? { stateSuffix } : {}),
  })
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
    logger: resolvedLogger,
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
  const groupStore = openTelegramGroupStore()
  resolvedLogger.debug?.({ stickerStore: true, groupStore: true }, "Gateway stores opened")
  const groupRegistry = createTelegramGroupRegistry({
    telegram: resolvedConfig.telegram,
    store: groupStore,
    logger: resolvedLogger,
  })
  const bot = createTelegramBot({
    token: resolvedConfig.telegram.botToken,
    telegram: resolvedConfig.telegram,
    controller,
    logger: resolvedLogger,
    progressVerbosity: resolvedConfig.progressVerbosity,
    voiceService,
    stickerStore,
    groupStore,
    groupRegistry,
    createGeneratedSkill: (input) =>
      createGeneratedSkill({ projectRoot: resolvedConfig.opencode.workdir, ...input }),
    bundledMemeRuntimeStatus: () =>
      bundledMemeRuntimeStatus({ projectRoot: resolvedConfig.opencode.workdir }),
    installBundledMemeRuntimeForProject: () =>
      installBundledMemeRuntimeForProject({ projectRoot: resolvedConfig.opencode.workdir }),
  })
  groupRegistry.setApi?.(bot.api)

  let stopping = false
  let telegramRunner = null
  async function shutdown(signal) {
    if (stopping) {
      return
    }
    stopping = true
    resolvedLogger.info({ signal }, "Shutting down gateway")
    resolvedLogger.debug?.({ signal }, "Gateway shutdown starting")
    if (telegramRunner) {
      await telegramRunner.stop()
    } else {
      await bot.stop()
    }
    await server.stop()
    stickerStore.close?.()
    groupStore.close?.()
    resolvedLogger.debug?.({ signal }, "Gateway shutdown completed")
  }

  processLike.once("SIGINT", shutdown)
  processLike.once("SIGTERM", shutdown)

  await registerTelegramBotCommands(bot, resolvedLogger)
  resolvedLogger.debug?.("Telegram commands registered")
  await groupRegistry.refreshAllowedGroups?.()
  resolvedLogger.debug?.("Telegram group registry refreshed")
  resolvedLogger.info("Starting Telegram polling")
  const allowedUpdates = ["message", "callback_query", "message_reaction", "my_chat_member"]
  resolvedLogger.debug?.({ allowedUpdates }, "Telegram polling starting")
  telegramRunner = startTelegramPolling(bot, { allowedUpdates })
  if (typeof telegramRunner?.task === "function") {
    await telegramRunner.task()
  }
}

export function startTelegramBotWithRunner(
  bot,
  { allowedUpdates, runTelegramBot = defaultRunTelegramBot } = {},
) {
  return runTelegramBot(bot, {
    runner: { fetch: { allowed_updates: allowedUpdates } },
  })
}

function prefixVoiceConfigValues(values) {
  return Object.fromEntries(
    Object.entries(values ?? {}).map(([key, value]) => [`voice.${key}`, value]),
  )
}
