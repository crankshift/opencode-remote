import { Bot, InlineKeyboard } from "grammy"
import { botCommands, renderHelpText } from "../../core/commands/commands.js"
import { chunkText } from "../../core/formatting/chunkText.js"
import { isAuthorizedTelegramUser } from "./auth.js"

export function createTelegramBot({ token, allowedUserId, controller, logger, botFactory = Bot }) {
  const bot = new botFactory(token)
  const sessionSelectionTokens = new Map()

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
        await botError.ctx?.reply?.("OpenCode Gateway failed while handling that request.")
      } catch (replyError) {
        logger.warn({ error: replyError }, "Could not send Telegram error reply")
      }
    })
  }

  bot.command("help", async (ctx) => ctx.reply(renderHelpText()))

  bot.command("status", async (ctx) => {
    const status = await controller.status()
    await ctx.reply(`Gateway is running. Active session: ${status.activeSessionId ?? "none"}`)
  })

  bot.command("new", async (ctx) => {
    const session = await controller.createSession()
    await ctx.reply(`Created session ${session.title ?? session.id}`)
  })

  bot.command("sessions", async (ctx) => {
    const sessions = await controller.listSessions()
    if (sessions.length === 0) {
      await ctx.reply("No OpenCode sessions found. Use /new to create one.")
      return
    }

    const keyboard = new InlineKeyboard()
    sessionSelectionTokens.clear()
    for (const [index, session] of sessions.slice(0, 20).entries()) {
      const token = String(index)
      sessionSelectionTokens.set(token, session.id)
      keyboard.text(formatSessionLabel(session), `session:${token}`).row()
    }

    await ctx.reply("Select a session:", { reply_markup: keyboard })
  })

  bot.callbackQuery(/^session:(.+)$/u, async (ctx) => {
    const sessionId = sessionSelectionTokens.get(ctx.match[1])
    if (!sessionId) {
      await ctx.answerCallbackQuery({ text: "Session selection expired" })
      return
    }
    await controller.selectSession(sessionId)
    await ctx.answerCallbackQuery({ text: "Session selected" })
    await ctx.reply(`Selected session ${sessionId}`)
  })

  bot.command("stop", async (ctx) => {
    const result = await controller.stop()
    if (!result.stopped) {
      await ctx.reply("No active OpenCode session to stop.")
      return
    }
    await ctx.reply("Stop requested for the active OpenCode session.")
  })

  bot.on("message:text", async (ctx) => {
    if (ctx.message.text.startsWith("/")) {
      return
    }

    const stopTyping = startTypingIndicator(ctx, logger)
    try {
      const response = await controller.sendPrompt(ctx.message.text)
      for (const chunk of chunkText(response)) {
        await ctx.reply(chunk)
      }
    } finally {
      stopTyping()
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
