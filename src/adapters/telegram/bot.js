import { rm } from "node:fs/promises"
import { Bot, InlineKeyboard } from "grammy"
import { botCommands, renderHelpText } from "../../core/commands/commands.js"
import { chunkText } from "../../core/formatting/chunkText.js"
import {
  createProgressTextState,
  PROGRESS_VERBOSITIES,
  recordProgressEvent,
} from "../../core/formatting/progressText.js"
import { isAuthorizedTelegramUser } from "./auth.js"
import { authorContextFromTelegramMessage } from "./author.js"
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
  for (const scope of [null, { type: "all_private_chats" }]) {
    try {
      if (scope) {
        await bot.api.setMyCommands(botCommands, { scope })
      } else {
        await bot.api.setMyCommands(botCommands)
      }
    } catch (error) {
      logger.warn({ error }, "Could not register Telegram commands")
    }
  }
}

export function createTelegramBot({
  token,
  allowedUserId,
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
  createStickerPrompt = defaultCreateStickerPrompt,
  cleanupStickerFiles = defaultCleanupStickerFiles,
  random = Math.random,
}) {
  const bot = new botFactory(token)
  let fallbackProgressVerbosity = progressVerbosity
  const sessionSelectionTokens = new Map()
  const permissionResponseTokens = createBoundedTokenStore(200)
  const stickerSaveTokens = createBoundedTokenStore(200)
  const botMessageMemory = createBotMessageMemory(200)
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
    if (!isAuthorizedTelegramUser(ctx, allowedUserId)) {
      logger.warn({ userId: ctx.from?.id }, "Ignoring unauthorized Telegram update")
      return
    }
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
    const session = await controller.createSession()
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

  bot.command("stop", async (ctx) => {
    const result = await controller.stop()
    if (!result.stopped) {
      await replyAndRemember(ctx, "No active OpenCode session to stop.", botMessageMemory)
      return
    }
    await replyAndRemember(ctx, "Stop requested for the active OpenCode session.", botMessageMemory)
  })

  bot.command("progress", async (ctx) => {
    const requestedVerbosity = parseProgressVerbosity(ctx.message?.text)
    if (!requestedVerbosity) {
      const activeProgressVerbosity = await getActiveProgressVerbosity()
      await replyAndRemember(
        ctx,
        `Tool progress is ${activeProgressVerbosity}. Use /progress off|new|all|verbose to change it.`,
        botMessageMemory,
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
    if (request.action === "status") {
      await replyAndRemember(ctx, formatVoiceStatus(await voiceService.status()), botMessageMemory)
      return
    }

    if (["on", "off", "all"].includes(request.action)) {
      const result = await voiceService.setMode(request.action)
      await replyAndRemember(ctx, `Voice mode set to ${result.mode}.`, botMessageMemory)
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

  bot.on("message_reaction", async (ctx) => {
    const update = ctx.messageReaction
    const botMessage = botMessageMemory.get(update.chat.id, update.message_id)
    if (!botMessage) {
      return
    }

    const addedEmojis = getAddedEmojiReactions(update.old_reaction, update.new_reaction)
    for (const emoji of addedEmojis) {
      const progress = await createPromptProgressRenderer(ctx)
      const response = await sendPromptWithProgress(
        formatPromptWithTelegramReactionInstruction(
          formatReactionFeedbackPrompt(emoji, botMessage),
        ),
        progress,
        ctx,
      )
      await progress.flush()
      const { visibleText } = parseTelegramReactionMarker(response, progress)
      for (const chunk of chunkText(visibleText)) {
        await replyAndRemember(ctx, chunk, botMessageMemory)
      }
    }
  })

  bot.on("message:text", async (ctx) => {
    if (ctx.message.text.startsWith("/")) {
      return
    }

    const chatId = ctx.message.chat.id
    const messageId = ctx.message.message_id
    const stopTyping = startTypingIndicator(ctx, logger)
    let requestedReaction = null
    const progress = await createPromptProgressRenderer(ctx)
    try {
      await setEmojiReaction(ctx, chatId, messageId, "👀", logger)
      const response = await sendPromptWithProgress(
        formatPromptWithTelegramReactionInstruction({
          text: ctx.message.text,
          author: authorContextFromTelegramMessage(ctx.message),
        }),
        progress,
        ctx,
      )
      await progress.flush()
      const parsedResponse = parseTelegramReactionMarker(response, progress)
      requestedReaction = parsedResponse.requestedReaction
      await replyWithPreferredMode(ctx, parsedResponse.visibleText, "text")
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
        formatPromptWithTelegramReactionInstruction({
          text: captionFromMessages(messages),
          author: authorContextFromTelegramMessage(messages[0]),
          attachments,
        }),
        progress,
        ctx,
      )
      await progress.flush()
      const parsedResponse = parseTelegramReactionMarker(response, progress)
      await replyWithPreferredMode(ctx, parsedResponse.visibleText, "photo")
      if (parsedResponse.requestedReaction) {
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
      const progress = await createPromptProgressRenderer(ctx)
      const response = await sendPromptWithProgress(
        formatPromptWithTelegramReactionInstruction({
          text: transcript,
          author: authorContextFromTelegramMessage(ctx.message),
        }),
        progress,
        ctx,
      )
      await progress.flush()
      const parsedResponse = parseTelegramReactionMarker(response, progress)
      await replyWithPreferredMode(ctx, parsedResponse.visibleText, "voice")
    } finally {
      stopTyping()
      await cleanupMediaAttachments(attachments, logger)
    }
  }

  async function handleStickerMessage(ctx) {
    let cleanupFiles = []
    const stopTyping = startTypingIndicator(ctx, logger)
    try {
      const result = await createStickerPrompt({
        api: ctx.api,
        token,
        sticker: ctx.message.sticker,
        store: stickerStore,
        logger,
      })
      cleanupFiles = result.cleanupFiles ?? []

      const progress = await createPromptProgressRenderer(ctx)
      const response = await sendPromptWithProgress(
        formatPromptWithTelegramReactionInstruction({
          ...result.prompt,
          author: authorContextFromTelegramMessage(ctx.message),
        }),
        progress,
        ctx,
      )
      await progress.flush()
      const parsedResponse = parseTelegramReactionMarker(response, progress)
      await replyWithPreferredMode(ctx, parsedResponse.visibleText, "sticker")
      if (parsedResponse.requestedReaction) {
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

  async function replyWithPreferredMode(ctx, text, source) {
    if (!voiceService?.shouldSpeak?.({ source })) {
      await sendTextReply(ctx, text)
      return
    }

    try {
      const voice = await voiceService.synthesizeTelegramVoice(text)
      const sentMessage = await sendVoice({ ctx, filePath: voice.filePath })
      const chatId = sentMessage?.chat?.id ?? ctx.chat?.id ?? ctx.message?.chat?.id
      botMessageMemory.remember(chatId, sentMessage?.message_id, text)
    } catch (error) {
      logger.warn({ error }, "Could not send Telegram voice reply")
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

    try {
      if (typeof ctx.replyWithSticker === "function") {
        await ctx.replyWithSticker(sticker.fileId)
      } else {
        const chatId = ctx.chat?.id ?? ctx.message?.chat?.id
        if (!chatId || typeof ctx.api?.sendSticker !== "function") {
          return false
        }
        await ctx.api.sendSticker(chatId, sticker.fileId)
      }
      return true
    } catch (error) {
      logger.warn({ error }, "Could not send Telegram sticker reaction")
      return false
    }
  }

  async function handleStickersCommand(ctx) {
    if (!stickerStore) {
      await replyAndRemember(ctx, "Sticker support is not configured.", botMessageMemory)
      return
    }

    const request = parseStickersCommand(ctx.message?.text)
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
      verbosity: await getActiveProgressVerbosity(),
      editThrottleMs: progressEditThrottleMs,
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
  const action = parts[1] ?? "status"
  if (action === "list") {
    return { action, filters: parseVoiceListFilters(parts.slice(2)) }
  }
  if (action === "set") {
    return { action, voice: parts[2] }
  }
  return { action }
}

function parseStickersCommand(text) {
  const parts = String(text ?? "")
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
  const action = parts[1] ?? "list"
  if (action === "forget") {
    return { action, packName: parts[2] }
  }
  return { action }
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
    `Voice: ${status.voice}`,
    `STT model: ${status.sttModel}`,
    `Groq API key: ${status.hasGroqApiKey ? "configured" : "missing"}`,
    `ffmpeg: ${status.ffmpegAvailable ? "available" : "missing"}`,
    `Cache: ${status.cacheDirectory}`,
  ].join("\n")
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
  return "Use /voice status|on|off|all|list|set|test."
}

function voiceListUsageText() {
  return "Use /voice list <countryCode|locale> [page]."
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

const TELEGRAM_REACTION_INSTRUCTION = [
  "Telegram gateway note:",
  "The gateway shows tool and skill usage separately in an Activity message. Do not include tool or skill usage announcements in your final response.",
  "If a short emoji reaction to the user's message is appropriate, include exactly one hidden marker anywhere in your response:",
  "[telegram_reaction: 👍]",
  "Use only one standard Telegram emoji, and omit the marker when no reaction is useful. The marker will be removed before the user sees the reply.",
].join("\n")

function formatPromptWithTelegramReactionInstruction(prompt) {
  if (typeof prompt !== "string") {
    return {
      ...prompt,
      text: [String(prompt?.text ?? ""), "", TELEGRAM_REACTION_INSTRUCTION].join("\n"),
    }
  }
  return [prompt, "", TELEGRAM_REACTION_INSTRUCTION].join("\n")
}

function parseTelegramReactionMarker(text, progress) {
  let requestedReaction = null
  const visibleText = String(text).replace(TELEGRAM_REACTION_MARKER, (_match, emoji) => {
    requestedReaction ??= emoji.trim()
    return ""
  })

  return {
    visibleText: stripToolingAnnouncements(visibleText, progress?.toolingTerms),
    requestedReaction,
  }
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
    return
  }

  try {
    await ctx.api.setMessageReaction(chatId, messageId, [{ type: "emoji", emoji }])
  } catch (error) {
    logger.warn({ error }, "Could not set Telegram message reaction")
  }
}

async function clearMessageReaction(ctx, chatId, messageId, logger) {
  if (!chatId || !messageId || !ctx.api?.setMessageReaction) {
    return
  }

  try {
    await ctx.api.setMessageReaction(chatId, messageId, [])
  } catch (error) {
    logger.warn({ error }, "Could not clear Telegram message reaction")
  }
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
