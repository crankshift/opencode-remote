import { Bot, InlineKeyboard } from "grammy"
import { botCommands, renderHelpText } from "../../core/commands/commands.js"
import { chunkText } from "../../core/formatting/chunkText.js"
import { isAuthorizedTelegramUser } from "./auth.js"

export function createTelegramBot({ token, allowedUserId, controller, logger, botFactory = Bot }) {
  const bot = new botFactory(token)

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
    for (const session of sessions.slice(0, 20)) {
      keyboard.text(session.title ?? session.id, `session:${session.id}`).row()
    }

    await ctx.reply("Select a session:", { reply_markup: keyboard })
  })

  bot.callbackQuery(/^session:(.+)$/u, async (ctx) => {
    const sessionId = ctx.match[1]
    await controller.selectSession(sessionId)
    await ctx.answerCallbackQuery({ text: "Session selected" })
    await ctx.reply(`Selected session ${sessionId}`)
  })

  bot.command("stop", async (ctx) => {
    await controller.stop()
    await ctx.reply("Stop requested for the active OpenCode session.")
  })

  bot.on("message:text", async (ctx) => {
    if (ctx.message.text.startsWith("/")) {
      return
    }
    await ctx.reply("Sending prompt to OpenCode...")
    const response = await controller.sendPrompt(ctx.message.text)
    for (const chunk of chunkText(response)) {
      await ctx.reply(chunk)
    }
  })

  return bot
}
