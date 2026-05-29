import { rm } from "node:fs/promises"
import { Bot, InlineKeyboard } from "grammy"
import {
  privateBotCommands,
  publicBotCommands,
  renderHelpText,
} from "../../core/commands/commands.js"
import { chunkText } from "../../core/formatting/chunkText.js"
import {
  createProgressTextState,
  PROGRESS_VERBOSITIES,
  recordProgressEvent,
} from "../../core/formatting/progressText.js"
import { isAuthorizedTelegramUser } from "./auth.js"
import { authorContextFromTelegramMessage } from "./author.js"
import { createGroupMemory as defaultCreateGroupMemory } from "./groupMemory.js"
import { createTelegramGroupMenu } from "./groupMenu.js"
import { createTelegramGroupPromptHelper } from "./groupPrompts.js"
import { createMemoryGroupStore } from "./groupStore.js"
import {
  captionFromMessages,
  cleanupAttachments as defaultCleanupMediaAttachments,
  downloadTelegramPhoto as defaultDownloadPhoto,
  selectLargestPhoto,
} from "./media.js"
import { createMediaGroupBuffer } from "./mediaGroupBuffer.js"
import {
  createStickerPrompt as defaultCreateStickerPrompt,
  stickerToStoreMetadata,
} from "./stickers.js"
import {
  downloadTelegramVoice as defaultDownloadVoice,
  sendTelegramVoice as defaultSendVoice,
} from "./voice.js"

const SAFE_ERROR_REPLY = "OpenCode Remote failed while handling that request."

export async function registerTelegramBotCommands(bot, logger) {
  for (const { commands, scope } of [
    { commands: publicBotCommands, scope: null },
    { commands: privateBotCommands, scope: { type: "all_private_chats" } },
  ]) {
    try {
      if (scope) {
        await bot.api.setMyCommands(commands, { scope })
      } else {
        await bot.api.setMyCommands(commands)
      }
    } catch (error) {
      logger.warn({ error }, "Could not register Telegram commands")
    }
  }
}

export function createTelegramBot({
  token,
  telegram,
  controller,
  logger,
  botFactory = Bot,
  mediaDirectory,
  mediaGroupWaitMs = 1500,
  progressVerbosity = "all",
  progressEditThrottleMs = 1500,
  downloadPhoto = defaultDownloadPhoto,
  downloadVoice = defaultDownloadVoice,
  sendVoice = defaultSendVoice,
  cleanupMediaAttachments = defaultCleanupMediaAttachments,
  voiceService = null,
  stickerStore = null,
  groupStore = createMemoryGroupStore({ allowedChatIds: telegram.allowedChatIds }),
  groupMemory = defaultCreateGroupMemory(),
  groupRegistry = null,
  botIdentity = {},
  createStickerPrompt = defaultCreateStickerPrompt,
  cleanupStickerFiles = defaultCleanupStickerFiles,
  random = Math.random,
  groupNoticeCooldownMs,
}) {
  const bot = new botFactory(token)
  let fallbackProgressVerbosity = progressVerbosity
  const sessionSelectionTokens = new Map()
  const permissionResponseTokens = createBoundedTokenStore(200)
  const stickerSaveTokens = createBoundedTokenStore(200)
  const stickerPackTokens = createBoundedTokenStore(200)
  const voiceSelectionTokens = createBoundedTokenStore(300)
  const botMessageMemory = createBotMessageMemory(200)
  const groupMenu = createTelegramGroupMenu({
    store: groupStore,
    memory: groupMemory,
    allowedChatIds: telegram.allowedChatIds,
    noticeCooldownMs: groupNoticeCooldownMs,
  })
  const groupPrompts = createTelegramGroupPromptHelper({
    groupStore,
    groupMemory,
    groupRegistry,
    controller,
    botIdentity,
    logger,
  })
  const mediaGroupBuffer = createMediaGroupBuffer({
    waitMs: mediaGroupWaitMs,
    logger,
    onFlush: async (messages) => {
      const ctx = messages[0]?.gatewayContext
      if (ctx) {
        await handleMediaGroupFlush(ctx, messages)
      }
    },
  })

  bot.use(async (ctx, next) => {
    if (!isAuthorizedTelegramUser(ctx, telegram)) {
      logger.warn(
        telegramUpdateLogContext(ctx, { authorized: false }),
        "Ignoring unauthorized Telegram update",
      )
      return
    }
    logger.debug?.(
      telegramUpdateLogContext(ctx, { authorized: true }),
      "Received authorized Telegram update",
    )
    await next()
  })

  if (typeof bot.catch === "function") {
    bot.catch(async (botError) => {
      const logError = logger.error ?? logger.warn
      logError.call(logger, { error: botError.error }, "Telegram update handling failed")
      try {
        if (botError.ctx?.reply) {
          await replyAndRemember(botError.ctx, SAFE_ERROR_REPLY, botMessageMemory)
        }
      } catch (replyError) {
        logger.warn({ error: replyError }, "Could not send Telegram error reply")
      }
    })
  }

  bot.command("help", async (ctx) => replyAndRemember(ctx, renderHelpText(), botMessageMemory))

  bot.command("status", async (ctx) => {
    const status = await controller.status()
    const activeProgressVerbosity = status.progressVerbosity ?? (await getActiveProgressVerbosity())
    await replyAndRemember(
      ctx,
      `Gateway is running. Active session: ${status.activeSessionId ?? "none"}. Tool progress: ${activeProgressVerbosity}`,
      botMessageMemory,
    )
  })

  bot.command("new", async (ctx) => {
    const session = await controller.createSession({
      context: await formatPromptForTelegramGateway(""),
    })
    clearGroupMemory("new_session")
    await replyAndRemember(ctx, `Created session ${session.title ?? session.id}`, botMessageMemory)
  })

  bot.command("sessions", async (ctx) => {
    const sessions = await controller.listSessions()
    if (sessions.length === 0) {
      await replyAndRemember(
        ctx,
        "No OpenCode sessions found. Use /new to create one.",
        botMessageMemory,
      )
      return
    }

    const keyboard = new InlineKeyboard()
    sessionSelectionTokens.clear()
    for (const [index, session] of sessions.slice(0, 20).entries()) {
      const token = String(index)
      sessionSelectionTokens.set(token, session.id)
      keyboard.text(formatSessionLabel(session), `session:${token}`).row()
    }

    await replyAndRemember(ctx, "Select a session:", botMessageMemory, { reply_markup: keyboard })
  })

  bot.callbackQuery(/^session:(.+)$/u, async (ctx) => {
    const sessionId = sessionSelectionTokens.get(ctx.match[1])
    if (!sessionId) {
      await ctx.answerCallbackQuery({ text: "Session selection expired" })
      return
    }
    await controller.selectSession(sessionId)
    clearGroupMemory("select_session")
    await ctx.answerCallbackQuery({ text: "Session selected" })
    await replyAndRemember(ctx, `Selected session ${sessionId}`, botMessageMemory)
  })

  bot.callbackQuery(/^perm:(once|always|reject):(.+)$/u, async (ctx) => {
    const decision = ctx.match[1]
    const token = ctx.match[2]
    const request = permissionResponseTokens.get(token)
    if (!request) {
      await ctx.answerCallbackQuery({ text: "Permission request expired" })
      return
    }

    permissionResponseTokens.delete(token)
    await controller.respondToPermission(request.sessionId, request.permissionId, decision)
    await ctx.answerCallbackQuery({ text: formatPermissionDecisionAnswer(decision) })
    if (ctx.reply) {
      await ctx.reply(formatPermissionDecisionText(decision))
    }
  })

  bot.callbackQuery(/^sticker_save:(.+)$/u, async (ctx) => {
    const sticker = stickerSaveTokens.get(ctx.match[1])
    if (!sticker) {
      await ctx.answerCallbackQuery({ text: "Sticker save request expired" })
      return
    }

    stickerSaveTokens.delete(ctx.match[1])
    const result = await saveStickerPackFromSticker(ctx, sticker)
    await ctx.answerCallbackQuery({ text: "Sticker pack saved" })
    if (ctx.reply) {
      await replyAndRemember(ctx, formatStickerSaveResult(result), botMessageMemory)
    }
  })

  bot.callbackQuery(/^progress:(off|new|all|verbose)$/u, async (ctx) => {
    const requestedVerbosity = ctx.match[1]
    const result = await setActiveProgressVerbosity(requestedVerbosity)
    await ctx.answerCallbackQuery({ text: `Tool progress set to ${result.progressVerbosity}` })
    await replyAndRemember(
      ctx,
      formatProgressMenuText(result.progressVerbosity),
      botMessageMemory,
      { reply_markup: progressMenuKeyboard() },
    )
  })

  bot.callbackQuery(/^voice:(menu|mode|captions|list|test)$/u, async (ctx) => {
    if (!voiceService) {
      await ctx.answerCallbackQuery({ text: "Voice mode is not configured" })
      return
    }
    const action = ctx.match[1]
    await ctx.answerCallbackQuery({ text: "Voice settings" })
    if (action === "menu") {
      await replyAndRemember(ctx, formatVoiceMenu(await voiceService.status()), botMessageMemory, {
        reply_markup: voiceMenuKeyboard(),
      })
      return
    }
    if (action === "mode") {
      await replyAndRemember(
        ctx,
        formatVoiceModeMenu(await voiceService.status()),
        botMessageMemory,
        {
          reply_markup: voiceModeMenuKeyboard(),
        },
      )
      return
    }
    if (action === "captions") {
      await replyAndRemember(
        ctx,
        formatVoiceCaptionsMenu(await voiceService.status()),
        botMessageMemory,
        { reply_markup: voiceCaptionsMenuKeyboard(await voiceService.status()) },
      )
      return
    }
    if (action === "list") {
      const countries = await listVoiceCountries(voiceService)
      await replyAndRemember(ctx, formatVoiceCountries(countries, 1), botMessageMemory, {
        reply_markup: voiceCountriesKeyboard(countries, 1),
      })
      return
    }
    const voice = await voiceService.synthesizeTelegramVoice("OpenCode Remote voice test.")
    await sendVoice({ ctx, filePath: voice.filePath })
    await replyAndRemember(ctx, "Voice test sent.", botMessageMemory)
  })

  bot.callbackQuery(/^voice_mode:(off|on|all)$/u, async (ctx) => {
    if (!voiceService) {
      await ctx.answerCallbackQuery({ text: "Voice mode is not configured" })
      return
    }
    const result = await voiceService.setMode(ctx.match[1])
    await ctx.answerCallbackQuery({ text: voiceModeLabel(result) })
    await replyAndRemember(
      ctx,
      formatVoiceMenu({ ...(await voiceService.status()), ...result }),
      botMessageMemory,
      { reply_markup: voiceMenuKeyboard() },
    )
  })

  bot.callbackQuery(/^voice_captions:(on|off)$/u, async (ctx) => {
    if (!voiceService) {
      await ctx.answerCallbackQuery({ text: "Voice mode is not configured" })
      return
    }
    const captions = ctx.match[1] === "on"
    const result = await voiceService.setCaptions(captions)
    await ctx.answerCallbackQuery({ text: `Voice captions set to ${captions ? "on" : "off"}` })
    await replyAndRemember(
      ctx,
      formatVoiceMenu({ ...(await voiceService.status()), ...result }),
      botMessageMemory,
      { reply_markup: voiceMenuKeyboard() },
    )
  })

  bot.callbackQuery(/^voice_country:([a-z]{2})$/u, async (ctx) => {
    if (!voiceService) {
      await ctx.answerCallbackQuery({ text: "Voice mode is not configured" })
      return
    }
    const locale = ctx.match[1]
    await ctx.answerCallbackQuery({ text: `Listing ${locale.toUpperCase()} voices` })
    await replyWithVoicePicker(ctx, locale, 1)
  })

  bot.callbackQuery(/^voice_page:([a-z]{2}):(\d+)$/u, async (ctx) => {
    if (!voiceService) {
      await ctx.answerCallbackQuery({ text: "Voice mode is not configured" })
      return
    }
    const locale = ctx.match[1]
    const page = Number(ctx.match[2]) || 1
    await ctx.answerCallbackQuery({ text: `Listing ${locale.toUpperCase()} voices` })
    await replyWithVoicePicker(ctx, locale, page)
  })

  bot.callbackQuery(/^voice_select:(.+)$/u, async (ctx) => {
    if (!voiceService) {
      await ctx.answerCallbackQuery({ text: "Voice mode is not configured" })
      return
    }
    const voiceShortName = voiceSelectionTokens.get(ctx.match[1])
    if (!voiceShortName) {
      await ctx.answerCallbackQuery({ text: "Voice selection expired" })
      return
    }
    const voice = await voiceService.setVoice(voiceShortName)
    await ctx.answerCallbackQuery({ text: "Voice selected" })
    await replyAndRemember(ctx, `Voice set to ${voice.ShortName}.`, botMessageMemory, {
      reply_markup: new InlineKeyboard().text("Back to Voice", "voice:menu"),
    })
  })

  bot.callbackQuery(/^voice_countries:(\d+)$/u, async (ctx) => {
    if (!voiceService) {
      await ctx.answerCallbackQuery({ text: "Voice mode is not configured" })
      return
    }
    const page = Number(ctx.match[1]) || 1
    const countries = await listVoiceCountries(voiceService)
    await ctx.answerCallbackQuery({ text: "Voice countries" })
    await replyAndRemember(ctx, formatVoiceCountries(countries, page), botMessageMemory, {
      reply_markup: voiceCountriesKeyboard(countries, page),
    })
  })

  bot.callbackQuery(/^stickers:(menu|list|help)$/u, async (ctx) => {
    if (!stickerStore) {
      await ctx.answerCallbackQuery({ text: "Sticker support is not configured" })
      return
    }
    const action = ctx.match[1]
    await ctx.answerCallbackQuery({ text: "Sticker packs" })
    if (action === "menu") {
      await replyAndRemember(
        ctx,
        formatStickersMenu(await stickerStore.listPacks()),
        botMessageMemory,
        { reply_markup: stickersMenuKeyboard() },
      )
      return
    }
    await replyAndRemember(
      ctx,
      action === "list"
        ? formatSavedStickerPackMenu(await stickerStore.listPacks(), stickerPackTokens)
        : stickersSaveHelpText(),
      botMessageMemory,
      {
        reply_markup:
          action === "list"
            ? savedStickerPacksKeyboard(await stickerStore.listPacks(), stickerPackTokens)
            : new InlineKeyboard().text("Back", "stickers:menu"),
      },
    )
  })

  bot.callbackQuery(/^sticker_pack:(.+)$/u, async (ctx) => {
    if (!stickerStore) {
      await ctx.answerCallbackQuery({ text: "Sticker support is not configured" })
      return
    }
    const packName = stickerPackTokens.get(ctx.match[1])
    if (!packName) {
      await ctx.answerCallbackQuery({ text: "Sticker pack menu expired" })
      return
    }
    const pack = (await stickerStore.listPacks()).find((candidate) => candidate.name === packName)
    if (!pack) {
      await ctx.answerCallbackQuery({ text: "Sticker pack not found" })
      return
    }
    await ctx.answerCallbackQuery({ text: packName })
    const token = stickerPackTokens.add(packName)
    await replyAndRemember(ctx, formatStickerPackMenu(pack), botMessageMemory, {
      reply_markup: new InlineKeyboard()
        .text("Forget Pack", `sticker_forget:${token}`)
        .row()
        .text("Back", "stickers:list"),
    })
  })

  bot.callbackQuery(/^sticker_forget:(.+)$/u, async (ctx) => {
    if (!stickerStore) {
      await ctx.answerCallbackQuery({ text: "Sticker support is not configured" })
      return
    }
    const packName = stickerPackTokens.get(ctx.match[1])
    if (!packName) {
      await ctx.answerCallbackQuery({ text: "Sticker pack menu expired" })
      return
    }
    const result = await stickerStore.forgetPack(packName)
    await cleanupStickerFiles(
      result.cacheRecords.map((record) => record.filePath),
      logger,
    )
    await ctx.answerCallbackQuery({
      text: result.deleted ? "Sticker pack forgotten" : "Pack not found",
    })
    await replyAndRemember(
      ctx,
      result.deleted
        ? `Forgot sticker pack ${packName}.`
        : `No saved sticker pack named ${packName}.`,
      botMessageMemory,
      { reply_markup: new InlineKeyboard().text("Back to Stickers", "stickers:menu") },
    )
  })

  bot.command("stop", async (ctx) => {
    const result = await controller.stop()
    if (!result.stopped) {
      await replyAndRemember(ctx, "No active OpenCode session to stop.", botMessageMemory)
      return
    }
    await replyAndRemember(ctx, "Stop requested for the active OpenCode session.", botMessageMemory)
  })

  bot.command("progress", async (ctx) => {
    if (!isPrivateTelegramChat(ctx)) {
      await replyAndRemember(
        ctx,
        "Tool progress is only available in private chats.",
        botMessageMemory,
      )
      return
    }

    const requestedVerbosity = parseProgressVerbosity(ctx.message?.text)
    if (!requestedVerbosity) {
      const activeProgressVerbosity = await getActiveProgressVerbosity()
      await replyAndRemember(
        ctx,
        formatProgressMenuText(activeProgressVerbosity),
        botMessageMemory,
        { reply_markup: progressMenuKeyboard() },
      )
      return
    }
    if (!PROGRESS_VERBOSITIES.includes(requestedVerbosity)) {
      await replyAndRemember(ctx, "Use /progress off|new|all|verbose.", botMessageMemory)
      return
    }

    const result = await setActiveProgressVerbosity(requestedVerbosity)
    await replyAndRemember(
      ctx,
      `Tool progress set to ${result.progressVerbosity}.`,
      botMessageMemory,
    )
  })

  bot.command("voice", async (ctx) => {
    if (!voiceService) {
      await replyAndRemember(ctx, "Voice mode is not configured.", botMessageMemory)
      return
    }

    const request = parseVoiceCommand(ctx.message?.text)
    if (request.action === "menu") {
      await replyAndRemember(ctx, formatVoiceMenu(await voiceService.status()), botMessageMemory, {
        reply_markup: voiceMenuKeyboard(),
      })
      return
    }
    if (request.action === "status") {
      await replyAndRemember(ctx, formatVoiceStatus(await voiceService.status()), botMessageMemory)
      return
    }

    if (["on", "off", "all"].includes(request.action)) {
      const result = await voiceService.setMode(request.action)
      await replyAndRemember(
        ctx,
        `Voice replies set to ${voiceModeLabel(result)}.`,
        botMessageMemory,
      )
      return
    }

    if (request.action === "captions") {
      if (request.captions === undefined) {
        const status = await voiceService.status()
        await replyAndRemember(
          ctx,
          `Voice captions are ${status.captions ? "on" : "off"}. ${voiceCaptionsUsageText()}`,
          botMessageMemory,
        )
        return
      }
      if (request.captions === null) {
        await replyAndRemember(ctx, voiceCaptionsUsageText(), botMessageMemory)
        return
      }
      const result = await voiceService.setCaptions(request.captions)
      await replyAndRemember(
        ctx,
        `Voice captions set to ${result.captions ? "on" : "off"}.`,
        botMessageMemory,
      )
      return
    }

    if (request.action === "list") {
      if (!request.filters) {
        await replyAndRemember(ctx, voiceListUsageText(), botMessageMemory)
        return
      }
      const result = await voiceService.listVoices(request.filters)
      await replyAndRemember(ctx, formatVoiceList(result), botMessageMemory)
      return
    }

    if (request.action === "set") {
      if (!request.voice) {
        await replyAndRemember(ctx, "Use /voice set <voiceShortName>.", botMessageMemory)
        return
      }
      const voice = await voiceService.setVoice(request.voice)
      await replyAndRemember(ctx, `Voice set to ${voice.ShortName}.`, botMessageMemory)
      return
    }

    if (request.action === "test") {
      const voice = await voiceService.synthesizeTelegramVoice("OpenCode Remote voice test.")
      await sendVoice({ ctx, filePath: voice.filePath })
      await replyAndRemember(ctx, "Voice test sent.", botMessageMemory)
      return
    }

    await replyAndRemember(ctx, voiceUsageText(), botMessageMemory)
  })

  bot.command("stickers", async (ctx) => {
    await handleStickersCommand(ctx)
  })

  bot.command("group", async (ctx) => {
    await groupMenu.handleCommand(ctx)
  })

  bot.callbackQuery(/^group:(.+)$/u, async (ctx) => {
    await groupMenu.handleCallback(ctx)
  })

  bot.on("message_reaction", async (ctx) => {
    const update = ctx.messageReaction
    if (!isPrivateTelegramChat(ctx) && !(await groupReactionsEnabled(update.chat.id))) {
      return
    }
    const botMessage = botMessageMemory.get(update.chat.id, update.message_id)
    if (!botMessage) {
      return
    }

    const addedEmojis = getAddedEmojiReactions(update.old_reaction, update.new_reaction)
    for (const emoji of addedEmojis) {
      const progress = await createPromptProgressRenderer(ctx)
      const response = await sendPromptWithProgress(
        await formatPromptForTelegramGateway(formatReactionFeedbackPrompt(emoji, botMessage)),
        progress,
        ctx,
      )
      await progress.flush()
      const { visibleText } = parseTelegramGatewayMarkers(response, progress)
      for (const chunk of chunkText(visibleText)) {
        await replyAndRemember(ctx, chunk, botMessageMemory)
      }
    }
  })

  bot.on("my_chat_member", async (ctx) => {
    await groupRegistry?.handleMyChatMember?.(ctx.myChatMember ?? ctx.update?.my_chat_member)
  })

  bot.on("message:text", async (ctx) => {
    if (await groupMenu.handlePendingText?.(ctx)) {
      return
    }
    if (ctx.message.text.startsWith("/")) {
      return
    }

    let groupScope = null
    let groupCurrentRecord = null
    let groupContextText = ""
    if (!isPrivateTelegramChat(ctx)) {
      const groupResult = await groupPrompts.prepareText(ctx)
      if (!groupResult.route) {
        return
      }
      groupScope = groupResult.scope
      groupCurrentRecord = groupResult.currentRecord
      groupContextText = groupResult.contextText
    }

    const chatId = ctx.message.chat.id
    const messageId = ctx.message.message_id
    const stopTyping = startTypingIndicator(ctx, logger)
    let requestedReaction = null
    const progress = await createPromptProgressRenderer(ctx)
    try {
      await setEmojiReaction(ctx, chatId, messageId, "👀", logger)
      const response = await sendPromptWithProgress(
        await formatPromptForTelegramGateway({
          text: groupPrompts.withContext(ctx.message.text, groupContextText),
          author: authorContextFromTelegramMessage(ctx.message),
        }),
        progress,
        ctx,
      )
      await progress.flush()
      const parsedResponse = parseTelegramGatewayMarkers(response, progress)
      requestedReaction = parsedResponse.requestedReaction
      const requestedSticker = parsedResponse.requestedSticker
      await replyWithPreferredMode(ctx, parsedResponse.visibleText, "text")
      groupPrompts.complete(groupScope, groupCurrentRecord, parsedResponse.visibleText)
      if (requestedSticker) {
        await sendRequestedSticker(ctx, requestedSticker)
        requestedReaction = null
      }
    } finally {
      await progress.flush()
      await clearMessageReaction(ctx, chatId, messageId, logger)
      stopTyping()
    }
    if (requestedReaction) {
      await handleRequestedReaction(ctx, chatId, messageId, requestedReaction)
    }
  })

  bot.on("message:photo", async (ctx) => {
    if (ctx.message.media_group_id) {
      mediaGroupBuffer.add({ ...ctx.message, gatewayContext: ctx })
      return
    }

    await handlePhotoMessages(ctx, [ctx.message])
  })

  bot.on("message:voice", async (ctx) => {
    await handleVoiceMessage(ctx)
  })

  bot.on("message:sticker", async (ctx) => {
    await handleStickerMessage(ctx)
  })

  return bot

  async function handlePhotoMessages(ctx, messages) {
    let groupScope = null
    let groupCurrentRecord = null
    let groupContextText = ""
    if (!isPrivateTelegramChat(ctx)) {
      const groupResult = await groupPrompts.preparePhoto(ctx, messages)
      if (!groupResult.route) {
        return
      }
      groupScope = groupResult.scope
      groupCurrentRecord = groupResult.currentRecord
      groupContextText = groupResult.contextText
    }

    const attachments = []
    const stopTyping = startTypingIndicator(ctx, logger)

    try {
      for (const message of messages) {
        const photo = selectLargestPhoto(message.photo)
        if (!photo) {
          continue
        }
        attachments.push(
          await downloadPhoto({
            api: ctx.api,
            token,
            photo,
            directory: mediaDirectory,
          }),
        )
      }

      if (attachments.length === 0) {
        await replyAndRemember(ctx, "No usable photo was found in that message.", botMessageMemory)
        return
      }

      const progress = await createPromptProgressRenderer(ctx)
      const response = await sendPromptWithProgress(
        await formatPromptForTelegramGateway({
          text: groupPrompts.withContext(captionFromMessages(messages), groupContextText),
          author: authorContextFromTelegramMessage(messages[0]),
          attachments,
        }),
        progress,
        ctx,
      )
      await progress.flush()
      const parsedResponse = parseTelegramGatewayMarkers(response, progress)
      await replyWithPreferredMode(ctx, parsedResponse.visibleText, "photo")
      groupPrompts.complete(groupScope, groupCurrentRecord, parsedResponse.visibleText)
      if (parsedResponse.requestedSticker) {
        await sendRequestedSticker(ctx, parsedResponse.requestedSticker)
      } else if (parsedResponse.requestedReaction) {
        await handleRequestedReaction(
          ctx,
          messages[0]?.chat?.id,
          messages[0]?.message_id,
          parsedResponse.requestedReaction,
        )
      }
    } finally {
      stopTyping()
      await cleanupMediaAttachments(attachments, logger)
    }
  }

  async function handleMediaGroupFlush(ctx, messages) {
    try {
      await handlePhotoMessages(ctx, messages)
    } catch (error) {
      const logError = logger.error ?? logger.warn
      logError.call(logger, { error }, "Telegram media group handling failed")
      try {
        await replyAndRemember(ctx, SAFE_ERROR_REPLY, botMessageMemory)
      } catch (replyError) {
        logger.warn({ error: replyError }, "Could not send Telegram error reply")
      }
    }
  }

  async function handleVoiceMessage(ctx) {
    if (!voiceService?.isEnabled?.()) {
      await replyAndRemember(
        ctx,
        "Voice mode is off. Use /voice on to enable voice prompts.",
        botMessageMemory,
      )
      return
    }

    const attachments = []
    const stopTyping = startTypingIndicator(ctx, logger)
    try {
      const attachment = await downloadVoice({
        api: ctx.api,
        token,
        voice: ctx.message.voice,
        directory: mediaDirectory,
      })
      attachments.push(attachment)

      const transcript = await voiceService.transcribe(attachment.filePath)
      let groupScope = null
      let groupCurrentRecord = null
      let groupContextText = ""
      if (!isPrivateTelegramChat(ctx)) {
        const groupResult = await groupPrompts.prepareVoice(ctx, transcript)
        if (!groupResult.route) {
          return
        }
        groupScope = groupResult.scope
        groupCurrentRecord = groupResult.currentRecord
        groupContextText = groupResult.contextText
      }
      const progress = await createPromptProgressRenderer(ctx)
      const response = await sendPromptWithProgress(
        await formatPromptForTelegramGateway({
          text: groupPrompts.withContext(transcript, groupContextText),
          author: authorContextFromTelegramMessage(ctx.message),
        }),
        progress,
        ctx,
      )
      await progress.flush()
      const parsedResponse = parseTelegramGatewayMarkers(response, progress)
      await replyWithPreferredMode(ctx, parsedResponse.visibleText, "voice")
      groupPrompts.complete(groupScope, groupCurrentRecord, parsedResponse.visibleText)
      if (parsedResponse.requestedSticker) {
        await sendRequestedSticker(ctx, parsedResponse.requestedSticker)
      }
    } finally {
      stopTyping()
      await cleanupMediaAttachments(attachments, logger)
    }
  }

  async function handleStickerMessage(ctx) {
    let groupScope = null
    let groupCurrentRecord = null
    let groupContextText = ""
    if (!isPrivateTelegramChat(ctx)) {
      const groupResult = await groupPrompts.prepareSticker(ctx)
      if (!groupResult.route) {
        return
      }
      groupScope = groupResult.scope
      groupCurrentRecord = groupResult.currentRecord
      groupContextText = groupResult.contextText
    }

    let cleanupFiles = []
    const stopTyping = startTypingIndicator(ctx, logger)
    try {
      const result = await createStickerPrompt({
        api: ctx.api,
        token,
        sticker: ctx.message.sticker,
        store: stickerStore,
        logger,
        describeStickerVisual,
      })
      cleanupFiles = result.cleanupFiles ?? []

      const progress = await createPromptProgressRenderer(ctx)
      const response = await sendPromptWithProgress(
        await formatPromptForTelegramGateway({
          ...result.prompt,
          text: groupPrompts.withContext(result.prompt?.text ?? "", groupContextText),
          author: authorContextFromTelegramMessage(ctx.message),
        }),
        progress,
        ctx,
      )
      await progress.flush()
      const parsedResponse = parseTelegramGatewayMarkers(response, progress)
      await replyWithPreferredMode(ctx, parsedResponse.visibleText, "sticker")
      groupPrompts.complete(groupScope, groupCurrentRecord, parsedResponse.visibleText)
      if (parsedResponse.requestedSticker) {
        await sendRequestedSticker(ctx, parsedResponse.requestedSticker)
      } else if (parsedResponse.requestedReaction) {
        await handleRequestedReaction(
          ctx,
          ctx.message?.chat?.id,
          ctx.message?.message_id,
          parsedResponse.requestedReaction,
        )
      }
      await offerSaveStickerPack(ctx, ctx.message.sticker, result.packName)
    } finally {
      stopTyping()
      await cleanupStickerFiles(cleanupFiles, logger)
    }
  }

  async function groupReactionsEnabled(chatId) {
    try {
      return (await groupStore.getSettings(chatId))?.reactions?.enabled === true
    } catch (error) {
      logger?.warn?.({ error, chatId }, "Could not read Telegram group reaction settings")
      return false
    }
  }

  function clearGroupMemory(reason) {
    groupMemory.clearAll?.()
    logger.debug?.({ reason }, "Telegram group memory cleared")
  }

  async function replyWithPreferredMode(ctx, text, source) {
    if (!String(text ?? "").trim()) {
      return
    }

    if (!voiceService?.shouldSpeak?.({ source })) {
      await sendTextReply(ctx, text)
      return
    }

    let sentMessage
    let caption
    try {
      const voice = await voiceService.synthesizeTelegramVoice(text)
      caption = voiceCaptionForText(text, voiceService)
      sentMessage = await sendVoice({
        ctx,
        filePath: voice.filePath,
        ...(caption ? { caption } : {}),
      })
    } catch (error) {
      logger.warn({ error }, "Could not send Telegram voice reply")
      await sendTextReply(ctx, text)
      return
    }

    const chatId = sentMessage?.chat?.id ?? ctx.chat?.id ?? ctx.message?.chat?.id
    botMessageMemory.remember(chatId, sentMessage?.message_id, text)
    if (voiceService?.shouldCaption?.() && !caption) {
      await sendTextReply(ctx, text)
    }
  }

  async function sendTextReply(ctx, text) {
    for (const chunk of chunkText(text)) {
      await replyAndRemember(ctx, chunk, botMessageMemory)
    }
  }

  async function handleRequestedReaction(ctx, chatId, messageId, emoji) {
    if (await maybeSendStickerReaction(ctx, emoji)) {
      return
    }
    await setEmojiReaction(ctx, chatId, messageId, emoji, logger)
  }

  async function maybeSendStickerReaction(ctx, emoji) {
    if (!stickerStore || random() >= 0.5) {
      return false
    }
    const sticker = await stickerStore.findStickerForEmoji(emoji, { random })
    if (!sticker?.fileId) {
      return false
    }

    return sendStickerFileId(ctx, sticker.fileId, "Could not send Telegram sticker reaction")
  }

  async function sendRequestedSticker(ctx, selector) {
    if (!stickerStore) {
      return false
    }
    const requestedEmoji = normalizeStickerSelector(selector)
    const sticker =
      typeof stickerStore.findStickerForSelector === "function"
        ? await stickerStore.findStickerForSelector(requestedEmoji, { random })
        : await stickerStore.findStickerForEmoji(requestedEmoji, { random })
    if (!sticker?.fileId) {
      return false
    }
    return sendStickerFileId(ctx, sticker.fileId, "Could not send Telegram sticker reply")
  }

  async function sendStickerFileId(ctx, fileId, warningMessage) {
    try {
      if (typeof ctx.replyWithSticker === "function") {
        await ctx.replyWithSticker(fileId)
      } else {
        const chatId = ctx.chat?.id ?? ctx.message?.chat?.id ?? ctx.messageReaction?.chat?.id
        if (!chatId || typeof ctx.api?.sendSticker !== "function") {
          return false
        }
        await ctx.api.sendSticker(chatId, fileId)
      }
      return true
    } catch (error) {
      logger.warn({ error }, warningMessage)
      return false
    }
  }

  async function handleStickersCommand(ctx) {
    if (!stickerStore) {
      await replyAndRemember(ctx, "Sticker support is not configured.", botMessageMemory)
      return
    }

    const request = parseStickersCommand(ctx.message?.text)
    if (request.action === "menu") {
      await replyAndRemember(
        ctx,
        formatStickersMenu(await stickerStore.listPacks()),
        botMessageMemory,
        { reply_markup: stickersMenuKeyboard() },
      )
      return
    }
    if (request.action === "save") {
      const sticker = ctx.message?.reply_to_message?.sticker
      if (!sticker) {
        await replyAndRemember(ctx, "Reply to a sticker with /stickers save.", botMessageMemory)
        return
      }
      if (!sticker.set_name) {
        await replyAndRemember(
          ctx,
          "That sticker does not belong to a saveable sticker pack.",
          botMessageMemory,
        )
        return
      }
      const result = await saveStickerPackFromSticker(ctx, sticker)
      await replyAndRemember(ctx, formatStickerSaveResult(result), botMessageMemory)
      return
    }

    if (request.action === "list") {
      await replyAndRemember(
        ctx,
        formatSavedStickerPacks(await stickerStore.listPacks()),
        botMessageMemory,
      )
      return
    }

    if (request.action === "forget") {
      if (!request.packName) {
        await replyAndRemember(ctx, "Use /stickers forget <pack_name>.", botMessageMemory)
        return
      }
      const result = await stickerStore.forgetPack(request.packName)
      await cleanupStickerFiles(
        result.cacheRecords.map((record) => record.filePath),
        logger,
      )
      await replyAndRemember(
        ctx,
        result.deleted
          ? `Forgot sticker pack ${request.packName}.`
          : `No saved sticker pack named ${request.packName}.`,
        botMessageMemory,
      )
      return
    }

    await replyAndRemember(ctx, stickersUsageText(), botMessageMemory)
  }

  async function replyWithVoicePicker(ctx, locale, page) {
    const result = await voiceService.listVoices({ locale, page, pageSize: VOICE_PICKER_PAGE_SIZE })
    await replyAndRemember(ctx, formatVoicePicker(result, locale), botMessageMemory, {
      reply_markup: voicePickerKeyboard(result, locale, voiceSelectionTokens),
    })
  }

  async function saveStickerPackFromSticker(ctx, sticker) {
    if (!sticker?.set_name) {
      throw new Error("Sticker does not belong to a saveable sticker pack")
    }

    let packName = sticker.set_name
    let stickers = [sticker]
    try {
      const stickerSet = await ctx.api?.getStickerSet?.(sticker.set_name)
      packName = stickerSet?.name ?? packName
      if (Array.isArray(stickerSet?.stickers) && stickerSet.stickers.length > 0) {
        stickers = stickerSet.stickers
      }
    } catch (error) {
      logger.warn({ error, packName }, "Could not fetch Telegram sticker set")
    }

    await stickerStore.savePack({
      name: packName,
      stickers: stickers.map(stickerToStoreMetadata),
    })
    return { packName, stickerCount: stickers.length }
  }

  async function offerSaveStickerPack(ctx, sticker, packName) {
    if (!stickerStore || !packName || (await stickerStore.hasSavedPack(packName))) {
      return
    }

    const token = stickerSaveTokens.add(sticker)
    const keyboard = new InlineKeyboard().text("Save pack", `sticker_save:${token}`)
    await replyAndRemember(
      ctx,
      `Sticker pack ${packName} is not saved. Save it for future sticker replies?`,
      botMessageMemory,
      { reply_markup: keyboard },
    )
  }

  async function createPromptProgressRenderer(ctx) {
    return createTelegramProgressRenderer({
      ctx,
      logger,
      verbosity: isPrivateTelegramChat(ctx) ? await getActiveProgressVerbosity() : "off",
      editThrottleMs: progressEditThrottleMs,
    })
  }

  async function formatPromptForTelegramGateway(prompt) {
    return formatPromptWithTelegramGatewayInstructions(prompt, { stickerStore, logger })
  }

  async function describeStickerVisual({ sticker, attachment, visualDescription }) {
    return controller.sendPrompt({
      text: formatStickerDescriptionRequest(sticker, visualDescription),
      attachments: [attachment],
    })
  }

  async function sendPromptWithProgress(prompt, progress, ctx) {
    const promptOptions = createPromptOptions(progress, ctx)
    if (promptOptions === undefined) {
      return controller.sendPrompt(prompt)
    }
    return controller.sendPrompt(prompt, promptOptions)
  }

  function createPromptOptions(progress, ctx) {
    if (!ctx) {
      return progress.promptOptions
    }
    return {
      ...(progress.promptOptions ?? {}),
      onSystemEvent: (event) => handleSystemEvent(ctx, event),
    }
  }

  async function handleSystemEvent(ctx, event) {
    if (event?.type === "permission.requested") {
      await sendPermissionRequest(ctx, event)
    }
  }

  async function sendPermissionRequest(ctx, event) {
    const token = permissionResponseTokens.add({
      sessionId: event.sessionId,
      permissionId: event.permissionId,
    })
    const keyboard = new InlineKeyboard()
      .text("Allow once", `perm:once:${token}`)
      .row()
      .text("Always allow", `perm:always:${token}`)
      .row()
      .text("Deny", `perm:reject:${token}`)

    await ctx.reply(formatPermissionRequest(event), { reply_markup: keyboard })
  }

  async function getActiveProgressVerbosity() {
    if (typeof controller.getProgressVerbosity === "function") {
      return controller.getProgressVerbosity()
    }
    return fallbackProgressVerbosity
  }

  async function setActiveProgressVerbosity(progressVerbosity) {
    if (typeof controller.setProgressVerbosity === "function") {
      return controller.setProgressVerbosity(progressVerbosity)
    }
    fallbackProgressVerbosity = progressVerbosity
    return { progressVerbosity }
  }
}

function formatPermissionRequest(event) {
  const lines = ["OpenCode needs permission:", event.title ?? "Permission request"]
  if (event.tool) {
    lines.push(`Tool: ${event.tool}`)
  }
  if (event.description) {
    lines.push(event.description)
  }
  lines.push("", "Choose how to respond:")
  return lines.join("\n")
}

function formatPermissionDecisionAnswer(decision) {
  if (decision === "reject") {
    return "Permission denied"
  }
  return "Permission approved"
}

function formatPermissionDecisionText(decision) {
  switch (decision) {
    case "once":
      return "Approved this OpenCode permission request once."
    case "always":
      return "Approved this OpenCode permission request and asked OpenCode to remember it."
    case "reject":
      return "Denied this OpenCode permission request."
    default:
      return "Responded to this OpenCode permission request."
  }
}

function parseProgressVerbosity(text) {
  const parts = String(text ?? "")
    .trim()
    .split(/\s+/u)
  return parts[1] ?? null
}

function parseVoiceCommand(text) {
  const parts = String(text ?? "")
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
  const action = parts[1] ?? "menu"
  if (action === "list") {
    return { action, filters: parseVoiceListFilters(parts.slice(2)) }
  }
  if (action === "set") {
    return { action, voice: parts[2] }
  }
  if (action === "captions") {
    return { action, captions: parseVoiceCaptionsValue(parts[2]) }
  }
  return { action }
}

function parseVoiceCaptionsValue(value) {
  if (value === undefined) {
    return undefined
  }
  if (value === "on") {
    return true
  }
  if (value === "off") {
    return false
  }
  return null
}

function parseStickersCommand(text) {
  const parts = String(text ?? "")
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
  const action = parts[1] ?? "menu"
  if (action === "forget") {
    return { action, packName: parts[2] }
  }
  return { action }
}

function formatProgressMenuText(progressVerbosity) {
  return [
    "Tool Progress",
    `Current: ${progressVerbosity}`,
    "Controls the editable Activity message in private chats. Groups always hide Activity.",
    "Direct commands still work: /progress off|new|all|verbose.",
  ].join("\n")
}

function progressMenuKeyboard() {
  return new InlineKeyboard()
    .text("Hide activity", "progress:off")
    .row()
    .text("Show new prompts", "progress:new")
    .row()
    .text("Show every update", "progress:all")
    .row()
    .text("Show detailed updates", "progress:verbose")
}

function formatStickerSaveResult(result) {
  const stickerWord = result.stickerCount === 1 ? "sticker" : "stickers"
  return `Saved sticker pack ${result.packName} (${result.stickerCount} ${stickerWord}).`
}

function formatSavedStickerPacks(packs) {
  if (!packs.length) {
    return "No sticker packs saved. Reply to a sticker with /stickers save."
  }
  return ["Saved sticker packs:", ...packs.map(formatSavedStickerPack)].join("\n")
}

function formatSavedStickerPackMenu(packs) {
  if (!packs.length) {
    return "Saved Sticker Packs\nNo sticker packs saved. Reply to a sticker with /stickers save."
  }
  return [
    "Saved Sticker Packs",
    "Tap a pack to inspect or forget it.",
    ...packs.map(formatSavedStickerPack),
  ].join("\n")
}

function savedStickerPacksKeyboard(packs, stickerPackTokens) {
  const keyboard = new InlineKeyboard()
  for (const pack of packs) {
    keyboard.text(pack.name, `sticker_pack:${stickerPackTokens.add(pack.name)}`).row()
  }
  keyboard.text("Back", "stickers:menu")
  return keyboard
}

function formatStickerPackMenu(pack) {
  const stickerWord = pack.stickerCount === 1 ? "sticker" : "stickers"
  const emojiSummary = pack.emojis.length > 0 ? `\nEmojis: ${pack.emojis.join(" ")}` : ""
  return [`Sticker pack: ${pack.name}`, `${pack.stickerCount} ${stickerWord}${emojiSummary}`].join(
    "\n",
  )
}

function formatStickersMenu(packs) {
  const packWord = packs.length === 1 ? "pack" : "packs"
  return [
    "Sticker Packs",
    `Saved: ${packs.length} ${packWord}`,
    "Use saved packs for future sticker replies.",
    "Reply to a sticker with /stickers save to add its pack.",
    "Direct commands still work: /stickers list and /stickers forget <pack_name>.",
  ].join("\n")
}

function stickersSaveHelpText() {
  return [
    "How to Save Sticker Packs",
    "Reply to a sticker with /stickers save to save that sticker pack for future sticker replies.",
    "Incoming stickers from unsaved packs may also show a Save Pack button.",
  ].join("\n")
}

function stickersMenuKeyboard() {
  return new InlineKeyboard()
    .text("Saved Packs", "stickers:list")
    .row()
    .text("How to Save", "stickers:help")
}

function formatSavedStickerPack(pack) {
  const stickerWord = pack.stickerCount === 1 ? "sticker" : "stickers"
  const emojiSummary = pack.emojis.length > 0 ? `, ${pack.emojis.join(" ")}` : ""
  return `- ${pack.name} (${pack.stickerCount} ${stickerWord}${emojiSummary})`
}

function stickersUsageText() {
  return "Use /stickers save, /stickers list, or /stickers forget <pack_name>."
}

function parseVoiceListFilters(parts) {
  if (parts.length < 1 || parts.length > 2) {
    return null
  }
  const localeFilter = parts[0]?.toLocaleLowerCase("en-US")
  const page = parts[1] ?? "1"
  if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/u.test(localeFilter) || !/^\d+$/u.test(page)) {
    return null
  }
  return { locale: localeFilter, page: Number(page), pageSize: 20 }
}

function formatVoiceStatus(status) {
  return [
    `Voice mode: ${status.enabled ? status.mode : "off"}`,
    `Voice captions: ${status.captions ? "on" : "off"}`,
    `Voice: ${status.voice}`,
    `STT model: ${status.sttModel}`,
    `Groq API key: ${status.hasGroqApiKey ? "configured" : "missing"}`,
    `ffmpeg: ${status.ffmpegAvailable ? "available" : "missing"}`,
    `Cache: ${status.cacheDirectory}`,
  ].join("\n")
}

function formatVoiceMenu(status) {
  return [
    "Voice Settings",
    `Reply format: ${voiceModeLabel(status)}`,
    `Captions: ${status.captions ? "on" : "off"}`,
    `Voice: ${status.voice}`,
    `STT: ${status.hasGroqApiKey ? "ready" : "missing Groq API key"}`,
    `ffmpeg: ${status.ffmpegAvailable ? "available" : "missing"}`,
    "Direct commands still work: /voice status|on|off|all|captions|list|set|test.",
  ].join("\n")
}

function formatVoiceModeMenu(status) {
  return [
    "Voice Reply Format",
    `Current: ${voiceModeLabel(status)}`,
    "Choose when Telegram replies should be sent as voice notes.",
  ].join("\n")
}

function voiceModeLabel(statusOrMode) {
  const mode =
    typeof statusOrMode === "string"
      ? statusOrMode
      : statusOrMode.enabled
        ? statusOrMode.mode
        : "off"
  if (mode === "all") return "voice for every prompt"
  if (mode === "on") return "voice when you send voice"
  return "text replies only"
}

function voiceModeMenuKeyboard() {
  return new InlineKeyboard()
    .text("Text replies only", "voice_mode:off")
    .row()
    .text("Voice when I send voice", "voice_mode:on")
    .row()
    .text("Voice for every prompt", "voice_mode:all")
    .row()
    .text("Back", "voice:menu")
}

function formatVoiceCaptionsMenu(status) {
  return [
    "Voice Captions",
    `Current: ${status.captions ? "on" : "off"}`,
    "Captions include short assistant text with generated voice notes.",
  ].join("\n")
}

function voiceCaptionsMenuKeyboard(status) {
  const next = status.captions ? "off" : "on"
  const label = status.captions ? "Turn Captions Off" : "Turn Captions On"
  return new InlineKeyboard().text(label, `voice_captions:${next}`).row().text("Back", "voice:menu")
}

const VOICE_COUNTRIES_PAGE_SIZE = 10
const VOICE_PICKER_PAGE_SIZE = 10

async function listVoiceCountries(voiceService) {
  const result = await voiceService.listVoices({ page: 1, pageSize: 10_000 })
  const countries = new Map()
  for (const voice of result.voices) {
    const country = voiceCountryCode(voice.Locale)
    if (!country) {
      continue
    }
    const existing = countries.get(country) ?? { code: country, locales: new Set(), count: 0 }
    existing.locales.add(String(voice.Locale ?? ""))
    existing.count += 1
    countries.set(country, existing)
  }
  return [...countries.values()]
    .map((country) => ({
      code: country.code,
      locales: [...country.locales].sort(localeCompare),
      count: country.count,
    }))
    .sort((left, right) => localeCompare(left.code, right.code))
}

function formatVoiceCountries(countries, page) {
  if (countries.length === 0) {
    return "Voice Countries\nNo voice countries found."
  }
  const totalPages = voiceCountryTotalPages(countries)
  const safePage = safeVoiceCountryPage(countries, page)
  const visibleCountries = voiceCountryPage(countries, safePage)
  return [
    `Voice Countries page ${safePage}/${totalPages}`,
    "Select a country to list available voices.",
    ...visibleCountries.map(formatVoiceCountry),
  ].join("\n")
}

function voiceCountriesKeyboard(countries, page) {
  const keyboard = new InlineKeyboard()
  const safePage = safeVoiceCountryPage(countries, page)
  for (const country of voiceCountryPage(countries, safePage)) {
    keyboard.text(formatVoiceCountryButton(country), `voice_country:${country.code}`).row()
  }
  const totalPages = voiceCountryTotalPages(countries)
  if (safePage > 1) {
    keyboard.text("Prev", `voice_countries:${safePage - 1}`)
  }
  if (safePage < totalPages) {
    keyboard.text("Next", `voice_countries:${safePage + 1}`)
  }
  if (totalPages > 1) {
    keyboard.row()
  }
  keyboard.text("Back", "voice:menu")
  return keyboard
}

function formatVoicePicker(result, locale) {
  if (!result.voices.length) {
    return `Voices for ${locale.toUpperCase()}\nNo voices found for that country.`
  }
  return [
    `Voices for ${locale.toUpperCase()} page ${result.page}/${result.totalPages}`,
    "Select a voice to use for Telegram voice replies.",
    ...result.voices.map(formatVoiceListItem),
  ].join("\n")
}

function voicePickerKeyboard(result, locale, voiceSelectionTokens) {
  const keyboard = new InlineKeyboard()
  for (const voice of result.voices) {
    keyboard
      .text(formatVoiceButton(voice), `voice_select:${voiceSelectionTokens.add(voice.ShortName)}`)
      .row()
  }
  if (result.page > 1) {
    keyboard.text("Prev", `voice_page:${locale}:${result.page - 1}`)
  }
  if (result.page < result.totalPages) {
    keyboard.text("Next", `voice_page:${locale}:${result.page + 1}`)
  }
  if (result.totalPages > 1) {
    keyboard.row()
  }
  keyboard.text("Back to Countries", "voice:list").row().text("Back to Voice", "voice:menu")
  return keyboard
}

function formatVoiceButton(voice) {
  return formatSessionLabel({ title: voice.ShortName })
}

function voiceCountryPage(countries, page) {
  const start = (safeVoiceCountryPage(countries, page) - 1) * VOICE_COUNTRIES_PAGE_SIZE
  return countries.slice(start, start + VOICE_COUNTRIES_PAGE_SIZE)
}

function safeVoiceCountryPage(countries, page) {
  return Math.min(Math.max(1, Number(page) || 1), voiceCountryTotalPages(countries))
}

function voiceCountryTotalPages(countries) {
  return Math.max(1, Math.ceil(countries.length / VOICE_COUNTRIES_PAGE_SIZE))
}

function formatVoiceCountry(country) {
  const voiceWord = country.count === 1 ? "voice" : "voices"
  return `- ${formatVoiceCountryButton(country)} (${country.count} ${voiceWord})`
}

function formatVoiceCountryButton(country) {
  return `${country.code.toUpperCase()} - ${country.locales.join(", ")}`
}

function voiceCountryCode(locale) {
  const parts = String(locale ?? "").split("-")
  const country = parts.at(-1)?.toLocaleLowerCase("en-US") ?? ""
  return /^[a-z]{2}$/u.test(country) ? country : ""
}

function localeCompare(left, right) {
  return String(left).localeCompare(String(right), "en-US")
}

function voiceMenuKeyboard() {
  return new InlineKeyboard()
    .text("Reply Format", "voice:mode")
    .row()
    .text("Captions", "voice:captions")
    .row()
    .text("List Voices", "voice:list")
    .row()
    .text("Test Voice", "voice:test")
}

function formatVoiceList(result) {
  if (!result.voices.length) {
    return "No voices found for that filter."
  }
  return [
    `Voices page ${result.page}/${result.totalPages} (${result.total} total):`,
    ...result.voices.map(formatVoiceListItem),
  ].join("\n")
}

function formatVoiceListItem(voice) {
  return `${voice.ShortName} - ${voice.Locale}, ${voice.Gender} - ${voice.FriendlyName}`
}

function voiceUsageText() {
  return "Use /voice status|on|off|all|captions|list|set|test."
}

function voiceCaptionsUsageText() {
  return "Use /voice captions on|off to change it."
}

function voiceListUsageText() {
  return "Use /voice list <countryCode|locale> [page]."
}

const TELEGRAM_VOICE_CAPTION_LIMIT = 1024

function voiceCaptionForText(text, voiceService) {
  if (!voiceService?.shouldCaption?.()) {
    return null
  }
  return text.length <= TELEGRAM_VOICE_CAPTION_LIMIT ? text : null
}

function createTelegramProgressRenderer({ ctx, logger, verbosity, editThrottleMs }) {
  const state = createProgressTextState({ verbosity })
  const enabled = state.verbosity !== "off"
  const toolingTerms = new Set()
  let progressMessage = null
  let pendingText = ""
  let lastText = ""
  let editTimer = null
  let editQueue = Promise.resolve()
  let disabled = !enabled

  const renderer = {
    promptOptions: enabled ? { onProgress } : undefined,
    toolingTerms,
    onProgress,
    flush,
  }
  return renderer

  async function onProgress(event) {
    if (disabled) {
      return
    }

    rememberToolingTerms(toolingTerms, event)
    const result = recordProgressEvent(state, event)
    if (!result.changed) {
      return
    }

    pendingText = fitTelegramActivityText(result.text)
    if (!progressMessage) {
      try {
        progressMessage = await ctx.reply(pendingText)
        lastText = pendingText
        pendingText = ""
      } catch (error) {
        disabled = true
        logger.warn({ error }, "Could not send Telegram progress message")
      }
      return
    }

    scheduleEdit()
  }

  function scheduleEdit() {
    if (editThrottleMs <= 0) {
      editQueue = editQueue.then(editNow)
      return
    }
    if (editTimer) {
      return
    }
    editTimer = setTimeout(() => {
      editTimer = null
      editQueue = editQueue.then(editNow)
    }, editThrottleMs)
  }

  async function flush() {
    if (editTimer) {
      clearTimeout(editTimer)
      editTimer = null
    }
    editQueue = editQueue.then(editNow)
    await editQueue
  }

  async function editNow() {
    if (disabled || !progressMessage || !pendingText || pendingText === lastText) {
      return
    }

    const chatId = progressMessage.chat?.id ?? ctx.chat?.id ?? ctx.message?.chat?.id
    if (!chatId || !progressMessage.message_id || !ctx.api?.editMessageText) {
      return
    }

    try {
      await ctx.api.editMessageText(chatId, progressMessage.message_id, pendingText)
      lastText = pendingText
      pendingText = ""
    } catch (error) {
      disabled = true
      logger.warn({ error }, "Could not edit Telegram progress message")
    }
  }
}

function isPrivateTelegramChat(ctx) {
  const chatType =
    ctx?.chat?.type ?? ctx?.message?.chat?.type ?? ctx?.callbackQuery?.message?.chat?.type
  return chatType !== "group" && chatType !== "supergroup" && chatType !== "channel"
}

function telegramUpdateLogContext(ctx, { authorized }) {
  return {
    authorized,
    chatType: telegramChatType(ctx),
    senderKind: telegramSenderKind(ctx),
    updateKind: telegramUpdateKind(ctx),
  }
}

function telegramChatType(ctx) {
  return (
    ctx?.chat?.type ??
    ctx?.message?.chat?.type ??
    ctx?.callbackQuery?.message?.chat?.type ??
    ctx?.messageReaction?.chat?.type ??
    ctx?.myChatMember?.chat?.type ??
    ctx?.update?.my_chat_member?.chat?.type ??
    "unknown"
  )
}

function telegramSenderKind(ctx) {
  const sender = ctx?.from ?? ctx?.message?.from ?? ctx?.callbackQuery?.from
  if (sender?.is_bot === true) {
    return "bot"
  }
  if (sender?.is_bot === false) {
    return "human"
  }
  if (ctx?.message?.sender_chat) {
    return "chat"
  }
  return "unknown"
}

function telegramUpdateKind(ctx) {
  if (ctx?.message) {
    return "message"
  }
  if (ctx?.callbackQuery) {
    return "callback_query"
  }
  if (ctx?.messageReaction) {
    return "message_reaction"
  }
  if (ctx?.myChatMember ?? ctx?.update?.my_chat_member) {
    return "my_chat_member"
  }
  if (ctx?.chat && ctx?.from) {
    return "message"
  }
  return "unknown"
}

function rememberToolingTerms(toolingTerms, event) {
  if (event?.type !== "tool.updated") {
    return
  }
  for (const value of [event.tool, event.title]) {
    const term = normalizeToolingTerm(value)
    if (term) {
      toolingTerms.add(term)
    }
  }
}

const TELEGRAM_ACTIVITY_TEXT_LIMIT = 3900

function fitTelegramActivityText(text) {
  if (text.length <= TELEGRAM_ACTIVITY_TEXT_LIMIT) {
    return text
  }

  const lines = text.split("\n").slice(1).reverse()
  const kept = []
  let nextText = "Activity\n..."
  for (const line of lines) {
    const candidate = ["Activity", "...", line, ...kept].join("\n")
    if (candidate.length > TELEGRAM_ACTIVITY_TEXT_LIMIT) {
      break
    }
    kept.unshift(line)
    nextText = candidate
  }
  return nextText
}

function formatSessionLabel(session) {
  const label = String(session.title ?? session.id ?? "OpenCode session")
  if (label.length <= 64) {
    return label
  }
  return `${label.slice(0, 61)}...`
}

function createBoundedTokenStore(limit) {
  const values = new Map()
  let nextToken = 0

  return {
    add(value) {
      const token = String(nextToken)
      nextToken += 1
      values.set(token, value)
      while (values.size > limit) {
        values.delete(values.keys().next().value)
      }
      return token
    },

    get(token) {
      return values.get(token)
    },

    delete(token) {
      values.delete(token)
    },
  }
}

function createBotMessageMemory(limit) {
  const messages = new Map()

  return {
    remember(chatId, messageId, text) {
      if (!chatId || !messageId || typeof text !== "string") {
        return
      }
      const key = botMessageKey(chatId, messageId)
      messages.delete(key)
      messages.set(key, text)
      while (messages.size > limit) {
        messages.delete(messages.keys().next().value)
      }
    },

    get(chatId, messageId) {
      return messages.get(botMessageKey(chatId, messageId))
    },
  }
}

function botMessageKey(chatId, messageId) {
  return `${chatId}:${messageId}`
}

async function replyAndRemember(ctx, text, botMessageMemory, options) {
  const sentMessage = options === undefined ? await ctx.reply(text) : await ctx.reply(text, options)
  const chatId = sentMessage?.chat?.id ?? ctx.chat?.id ?? ctx.message?.chat?.id
  botMessageMemory.remember(chatId, sentMessage?.message_id, text)
  return sentMessage
}

const TELEGRAM_REACTION_MARKER = /\[telegram_reaction:\s*([^\]\n]+?)\s*\]/giu
const TELEGRAM_STICKER_MARKER = /\[telegram_sticker:\s*([^\]\n]+?)\s*\]/giu

const TELEGRAM_REACTION_INSTRUCTION = [
  "Telegram gateway note:",
  "The gateway shows tool and skill usage separately in an Activity message. Do not include tool or skill usage announcements in your final response.",
  "If a short emoji reaction to the user's message is appropriate, include exactly one hidden marker anywhere in your response:",
  "[telegram_reaction: 👍]",
  "Use only one standard Telegram emoji, and omit the marker when no reaction is useful. The marker will be removed before the user sees the reply.",
].join("\n")

async function formatPromptWithTelegramGatewayInstructions(prompt, { stickerStore, logger } = {}) {
  const instructions = [TELEGRAM_REACTION_INSTRUCTION]
  const stickerInstruction = await createTelegramStickerReplyInstruction(stickerStore, logger)
  if (stickerInstruction) {
    instructions.push(stickerInstruction)
  }
  return appendPromptInstruction(prompt, instructions.join("\n\n"))
}

function appendPromptInstruction(prompt, instruction) {
  if (typeof prompt !== "string") {
    return {
      ...prompt,
      text: [String(prompt?.text ?? ""), "", instruction].join("\n"),
    }
  }
  return [prompt, "", instruction].join("\n")
}

async function createTelegramStickerReplyInstruction(stickerStore, logger) {
  if (typeof stickerStore?.listPacks !== "function") {
    return null
  }

  let packs
  try {
    packs = await stickerStore.listPacks()
  } catch (error) {
    logger?.warn?.({ error }, "Could not list saved Telegram sticker packs")
    return null
  }

  if (!Array.isArray(packs) || packs.length === 0) {
    return null
  }

  const emojis = savedStickerEmojis(packs)
  const catalog = await readStickerCatalog(stickerStore, logger)
  const exampleEmoji = emojis[0] ?? "any"
  return [
    "Telegram sticker reply capability:",
    "If the user explicitly asks for a sticker, include exactly one hidden marker anywhere in your response:",
    `[telegram_sticker: ${exampleEmoji}]`,
    "Use an emoji or short sticker description from the available saved sticker catalog when it matches the requested mood, or use [telegram_sticker: any]. The marker will be removed before the user sees the reply.",
    `Available saved sticker packs: ${formatStickerInstructionPacks(packs)}`,
    `Available saved sticker emojis: ${emojis.length > 0 ? emojis.join(" ") : "any"}`,
    ...(catalog.length > 0
      ? ["Available saved sticker catalog:", ...catalog.map(formatStickerCatalogItem)]
      : []),
  ].join("\n")
}

async function readStickerCatalog(stickerStore, logger) {
  if (typeof stickerStore?.listStickerCatalog !== "function") {
    return []
  }
  try {
    return (await stickerStore.listStickerCatalog()).filter((sticker) => sticker.description)
  } catch (error) {
    logger?.warn?.({ error }, "Could not list saved Telegram sticker catalog")
    return []
  }
}

function formatStickerCatalogItem(sticker) {
  const packName = sticker.packName ?? "saved sticker"
  const emoji = sticker.emoji ? `${sticker.emoji} ` : ""
  return `- ${emoji}${packName}: ${sticker.description}`
}

function savedStickerEmojis(packs) {
  return [...new Set(packs.flatMap((pack) => pack.emojis ?? []).filter(Boolean))]
}

function formatStickerInstructionPacks(packs) {
  return packs.map(formatStickerInstructionPack).join(", ")
}

function formatStickerInstructionPack(pack) {
  const emojis =
    Array.isArray(pack.emojis) && pack.emojis.length > 0 ? ` (${pack.emojis.join(" ")})` : ""
  return `${pack.name}${emojis}`
}

function parseTelegramGatewayMarkers(text, progress) {
  let requestedReaction = null
  let requestedSticker = null
  const visibleText = String(text)
    .replace(TELEGRAM_REACTION_MARKER, (_match, emoji) => {
      requestedReaction ??= emoji.trim()
      return ""
    })
    .replace(TELEGRAM_STICKER_MARKER, (_match, sticker) => {
      requestedSticker ??= normalizeStickerSelector(sticker)
      return ""
    })

  return {
    visibleText: stripToolingAnnouncements(visibleText, progress?.toolingTerms),
    requestedReaction,
    requestedSticker,
  }
}

function normalizeStickerSelector(selector) {
  return String(selector ?? "").trim() || "any"
}

function formatStickerDescriptionRequest(sticker, visualDescription) {
  return [
    "Gateway internal task: describe this Telegram sticker for a saved sticker catalog.",
    "Use the attached cached sticker visual or preview.",
    "Return only a short lowercase noun phrase of 2 to 6 words.",
    "Do not include IDs, file paths, markdown, quotes, or hidden gateway markers.",
    "Focus on visible content and mood, for example: laughing orange cat, thumbs up duck, angry wizard.",
    "",
    "Sticker metadata:",
    `- Sticker emoji: ${sticker?.emoji ?? "unknown"}`,
    `- Sticker pack: ${sticker?.set_name ?? "none"}`,
    `- Sticker visual: ${visualDescription}`,
  ].join("\n")
}

function stripToolingAnnouncements(text, toolingTerms = new Set()) {
  const lines = String(text)
    .trim()
    .split("\n")
    .map((line) => line.trim())
  while (lines.length > 0 && isToolingAnnouncementLine(lines[0], toolingTerms)) {
    lines.shift()
    while (lines[0] === "") {
      lines.shift()
    }
  }
  return lines.join("\n").trim()
}

function isToolingAnnouncementLine(line, toolingTerms) {
  if (
    lineReferencesKnownToolingTerm(line, toolingTerms) &&
    TOOLING_ANNOUNCEMENT_INTRO_PATTERNS.some((pattern) => pattern.test(line))
  ) {
    return true
  }

  return TOOLING_ANNOUNCEMENT_CONTEXT_PATTERNS.some((pattern) => pattern.test(line))
}

function lineReferencesKnownToolingTerm(line, toolingTerms) {
  const normalizedLine = normalizeToolingTerm(line)
  if (!normalizedLine) {
    return false
  }
  for (const term of toolingTerms ?? []) {
    if (term && normalizedLine.includes(term)) {
      return true
    }
  }
  return false
}

function normalizeToolingTerm(value) {
  if (typeof value !== "string") {
    return ""
  }
  return value
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{Letter}\p{Number}_-]+/gu, " ")
    .trim()
}

const TOOLING_ANNOUNCEMENT_INTRO_PATTERNS = [
  /^using\b/iu,
  /^i(?:'|’)?m\s+using\b/iu,
  /^i\s+am\s+using\b/iu,
  /^використовую(?:\s|$)/iu,
]

const TOOLING_ANNOUNCEMENT_CONTEXT_PATTERNS = [
  /^using\s+[a-z][a-z0-9-]*(?:\s+(?:skill|tool))?\s+to\b.*$/iu,
  /^i(?:'|’)?m\s+using\s+[a-z][a-z0-9-]*(?:\s+(?:skill|tool))?\s+to\b.*$/iu,
  /^i\s+am\s+using\s+[a-z][a-z0-9-]*(?:\s+(?:skill|tool))?\s+to\b.*$/iu,
  /^використовую\s+.+(?:skill|навичк|інструмент|для\b).*$/iu,
]

async function defaultCleanupStickerFiles(filePaths = [], logger) {
  for (const filePath of filePaths) {
    if (!filePath) {
      continue
    }
    try {
      await rm(filePath, { force: true })
    } catch (error) {
      logger?.warn?.({ error, filePath }, "Could not clean up Telegram sticker file")
    }
  }
}

async function setEmojiReaction(ctx, chatId, messageId, emoji, logger) {
  if (!chatId || !messageId || !ctx.api?.setMessageReaction) {
    logger?.debug?.(
      telegramReactionLogContext(ctx, {
        action: "set",
        emoji,
        ok: false,
        skippedReason: "missing_api_or_target",
      }),
      "Telegram message reaction skipped",
    )
    return
  }

  try {
    await ctx.api.setMessageReaction(chatId, messageId, [{ type: "emoji", emoji }])
    logger?.debug?.(
      telegramReactionLogContext(ctx, { action: "set", emoji, ok: true }),
      "Telegram message reaction updated",
    )
  } catch (error) {
    logger.warn(
      { error, ...telegramReactionLogContext(ctx, { action: "set", emoji, ok: false }) },
      "Could not set Telegram message reaction",
    )
  }
}

async function clearMessageReaction(ctx, chatId, messageId, logger) {
  if (!chatId || !messageId || !ctx.api?.setMessageReaction) {
    logger?.debug?.(
      telegramReactionLogContext(ctx, {
        action: "clear",
        emoji: null,
        ok: false,
        skippedReason: "missing_api_or_target",
      }),
      "Telegram message reaction skipped",
    )
    return
  }

  try {
    await ctx.api.setMessageReaction(chatId, messageId, [])
    logger?.debug?.(
      telegramReactionLogContext(ctx, { action: "clear", emoji: null, ok: true }),
      "Telegram message reaction updated",
    )
  } catch (error) {
    logger.warn(
      { error, ...telegramReactionLogContext(ctx, { action: "clear", emoji: null, ok: false }) },
      "Could not clear Telegram message reaction",
    )
  }
}

function telegramReactionLogContext(ctx, { action, emoji, ok, skippedReason }) {
  return {
    chatType: telegramChatType(ctx),
    hasThread: Number.isInteger(ctx?.message?.message_thread_id),
    messageKind: telegramMessageKind(ctx),
    ok,
    reactionAction: action,
    reactionEmoji: emoji ?? null,
    reactionKind: emoji === "👀" || action === "clear" ? "temporary_eye" : "requested",
    senderKind: telegramSenderKind(ctx),
    ...(skippedReason ? { skippedReason } : {}),
  }
}

function telegramMessageKind(ctx) {
  const message = ctx?.message
  if (message?.text) {
    return "text"
  }
  if (message?.photo) {
    return "photo"
  }
  if (message?.voice) {
    return "voice"
  }
  if (message?.sticker) {
    return "sticker"
  }
  return telegramUpdateKind(ctx)
}

function getAddedEmojiReactions(oldReactions = [], newReactions = []) {
  const oldEmojis = new Set(
    oldReactions.filter((reaction) => reaction.type === "emoji").map((reaction) => reaction.emoji),
  )
  return newReactions
    .filter((reaction) => reaction.type === "emoji" && !oldEmojis.has(reaction.emoji))
    .map((reaction) => reaction.emoji)
}

function formatReactionFeedbackPrompt(emoji, botMessage) {
  return [
    `User reacted to one of your Telegram bot messages with ${emoji}.`,
    "",
    "Bot message:",
    botMessage,
  ].join("\n")
}

function startTypingIndicator(ctx, logger) {
  const chatId = ctx.message?.chat?.id
  if (!chatId || !ctx.api?.sendChatAction) {
    return () => undefined
  }

  const sendTyping = () => {
    ctx.api.sendChatAction(chatId, "typing").catch((error) => {
      logger.warn({ error }, "Could not send Telegram typing action")
    })
  }

  sendTyping()
  const interval = setInterval(sendTyping, 4000)
  return () => clearInterval(interval)
}
