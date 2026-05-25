import { Bot, InlineKeyboard } from "grammy"
import { botCommands, renderHelpText } from "../../core/commands/commands.js"
import { chunkText } from "../../core/formatting/chunkText.js"
import { isAuthorizedTelegramUser } from "./auth.js"

export function createTelegramBot({ token, allowedUserId, controller, logger, botFactory = Bot }) {
  const bot = new botFactory(token)
  const sessionSelectionTokens = new Map()
  const botMessageMemory = createBotMessageMemory(200)

  bot.use(async (ctx, next) => {
    if (!isAuthorizedTelegramUser(ctx, allowedUserId)) {
      logger.warn({ userId: ctx.from?.id }, "Ignoring unauthorized Telegram update")
      return
    }
    await next()
  })

  bot.api.setMyCommands(botCommands).catch((error) => {
    logger.warn({ error }, "Could not register Telegram commands")
  })

  if (typeof bot.catch === "function") {
    bot.catch(async (botError) => {
      const logError = logger.error ?? logger.warn
      logError.call(logger, { error: botError.error }, "Telegram update handling failed")
      try {
        if (botError.ctx?.reply) {
          await replyAndRemember(
            botError.ctx,
            "OpenCode Remote failed while handling that request.",
            botMessageMemory,
          )
        }
      } catch (replyError) {
        logger.warn({ error: replyError }, "Could not send Telegram error reply")
      }
    })
  }

  bot.command("help", async (ctx) => replyAndRemember(ctx, renderHelpText(), botMessageMemory))

  bot.command("status", async (ctx) => {
    const status = await controller.status()
    await replyAndRemember(
      ctx,
      `Gateway is running. Active session: ${status.activeSessionId ?? "none"}`,
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

  bot.command("stop", async (ctx) => {
    const result = await controller.stop()
    if (!result.stopped) {
      await replyAndRemember(ctx, "No active OpenCode session to stop.", botMessageMemory)
      return
    }
    await replyAndRemember(ctx, "Stop requested for the active OpenCode session.", botMessageMemory)
  })

  bot.on("message_reaction", async (ctx) => {
    const update = ctx.messageReaction
    const botMessage = botMessageMemory.get(update.chat.id, update.message_id)
    if (!botMessage) {
      return
    }

    const addedEmojis = getAddedEmojiReactions(update.old_reaction, update.new_reaction)
    for (const emoji of addedEmojis) {
      const response = await controller.sendPrompt(formatReactionFeedbackPrompt(emoji, botMessage))
      const { visibleText } = parseTelegramReactionMarker(response)
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
    try {
      await setEmojiReaction(ctx, chatId, messageId, "👀", logger)
      const response = await controller.sendPrompt(
        formatPromptWithTelegramReactionInstruction(ctx.message.text),
      )
      const parsedResponse = parseTelegramReactionMarker(response)
      requestedReaction = parsedResponse.requestedReaction
      for (const chunk of chunkText(parsedResponse.visibleText)) {
        await replyAndRemember(ctx, chunk, botMessageMemory)
      }
    } finally {
      await clearMessageReaction(ctx, chatId, messageId, logger)
      stopTyping()
    }
    if (requestedReaction) {
      await setEmojiReaction(ctx, chatId, messageId, requestedReaction, logger)
    }
  })

  return bot
}

function formatSessionLabel(session) {
  const label = String(session.title ?? session.id ?? "OpenCode session")
  if (label.length <= 64) {
    return label
  }
  return `${label.slice(0, 61)}...`
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
  "If a short emoji reaction to the user's message is appropriate, include exactly one hidden marker anywhere in your response:",
  "[telegram_reaction: 👍]",
  "Use only one standard Telegram emoji, and omit the marker when no reaction is useful. The marker will be removed before the user sees the reply.",
].join("\n")

function formatPromptWithTelegramReactionInstruction(prompt) {
  return [prompt, "", TELEGRAM_REACTION_INSTRUCTION].join("\n")
}

function parseTelegramReactionMarker(text) {
  let requestedReaction = null
  const visibleText = String(text).replace(TELEGRAM_REACTION_MARKER, (_match, emoji) => {
    requestedReaction ??= emoji.trim()
    return ""
  })

  return {
    visibleText: visibleText.trim(),
    requestedReaction,
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
