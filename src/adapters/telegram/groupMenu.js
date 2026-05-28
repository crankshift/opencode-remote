import { InlineKeyboard } from "grammy"

const GROUP_NOTICE_TEXT = "Group settings are managed in DM. Message me and run /group."

export function createTelegramGroupMenu({
  store,
  memory,
  noticeCooldownMs = 10 * 60 * 1000,
  now = Date.now,
} = {}) {
  const noticeTimes = new Map()
  const groupTokens = createTokenStore(200)

  return {
    async handleCommand(ctx) {
      if (!isPrivateChat(ctx)) {
        await maybeSendGroupNotice(ctx)
        return
      }

      const groups = typeof store?.listGroups === "function" ? await store.listGroups() : []
      if (groups.length === 0) {
        await ctx.reply("No known Telegram groups are configured for this gateway.")
        return
      }

      const keyboard = new InlineKeyboard()
      for (const group of groups) {
        const token = groupTokens.add({
          action: "select",
          chatId: group.chatId,
          userId: ctx.from?.id,
        })
        keyboard.text(group.title, `group:${token}`).row()
      }
      await ctx.reply("Select a Telegram group to configure:", { reply_markup: keyboard })
    },

    async handleCallback(ctx) {
      const token = ctx.match?.[1]
      const selection = groupTokens.get(token)
      if (!selection || selection.userId !== ctx.from?.id) {
        await ctx.answerCallbackQuery({ text: "Group menu expired" })
        return
      }
      if (selection.action === "reply") {
        await store.updateSettings(selection.chatId, { replyPolicy: selection.replyPolicy })
        await ctx.answerCallbackQuery({ text: "Reply policy updated" })
        await replyWithSettingsMenu(ctx, selection.chatId, selection.userId)
        return
      }
      if (selection.action === "toggle_trigger") {
        const settings = await store.getSettings(selection.chatId)
        await store.updateSettings(selection.chatId, {
          triggers: { [selection.trigger]: !settings.triggers[selection.trigger] },
        })
        await ctx.answerCallbackQuery({ text: "Trigger updated" })
        await replyWithSettingsMenu(ctx, selection.chatId, selection.userId)
        return
      }
      if (selection.action === "toggle_memory") {
        const settings = await store.getSettings(selection.chatId)
        await store.updateSettings(selection.chatId, {
          memory: { enabled: !settings.memory.enabled },
        })
        await ctx.answerCallbackQuery({ text: "Memory updated" })
        await replyWithSettingsMenu(ctx, selection.chatId, selection.userId)
        return
      }
      if (selection.action === "context_messages") {
        await store.updateSettings(selection.chatId, { context: { messages: selection.messages } })
        await ctx.answerCallbackQuery({ text: "Context messages updated" })
        await replyWithSettingsMenu(ctx, selection.chatId, selection.userId)
        return
      }
      if (selection.action === "context_chars") {
        await store.updateSettings(selection.chatId, { context: { chars: selection.chars } })
        await ctx.answerCallbackQuery({ text: "Context chars updated" })
        await replyWithSettingsMenu(ctx, selection.chatId, selection.userId)
        return
      }
      if (selection.action === "clear_memory") {
        memory?.clearChat?.(selection.chatId)
        await ctx.answerCallbackQuery({ text: "Group memory cleared" })
        await replyWithSettingsMenu(ctx, selection.chatId, selection.userId)
        return
      }

      await ctx.answerCallbackQuery({ text: "Group selected" })
      await replyWithSettingsMenu(ctx, selection.chatId, selection.userId)
    },
  }

  async function replyWithSettingsMenu(ctx, chatId, userId) {
    const settings = await store.getSettings(chatId)
    const groups = typeof store?.listGroups === "function" ? await store.listGroups() : []
    const group = groups.find((candidate) => candidate.chatId === chatId)
    const keyboard = new InlineKeyboard()
    for (const replyPolicy of ["off", "humans", "bots", "all"]) {
      const token = groupTokens.add({ action: "reply", chatId, userId, replyPolicy })
      keyboard.text(`Reply: ${replyPolicy}`, `group:${token}`).row()
    }
    for (const trigger of ["reply", "mention", "namePrefix", "nameAnywhere"]) {
      const token = groupTokens.add({ action: "toggle_trigger", chatId, userId, trigger })
      keyboard
        .text(
          `Trigger ${formatTriggerLabel(trigger)}: ${settings.triggers[trigger] ? "on" : "off"}`,
          `group:${token}`,
        )
        .row()
    }
    const memoryToken = groupTokens.add({ action: "toggle_memory", chatId, userId })
    keyboard.text(`Memory: ${settings.memory.enabled ? "off" : "on"}`, `group:${memoryToken}`).row()
    for (const messages of [10, 30, 50]) {
      const token = groupTokens.add({ action: "context_messages", chatId, userId, messages })
      keyboard.text(`Context messages: ${messages}`, `group:${token}`).row()
    }
    for (const chars of [4_000, 12_000, 24_000]) {
      const token = groupTokens.add({ action: "context_chars", chatId, userId, chars })
      keyboard.text(`Context chars: ${formatChars(chars)}`, `group:${token}`).row()
    }
    const clearToken = groupTokens.add({ action: "clear_memory", chatId, userId })
    keyboard.text("Clear memory", `group:${clearToken}`)
    await ctx.reply(formatGroupSettings(group?.title ?? `Group ${chatId}`, settings), {
      reply_markup: keyboard,
    })
  }

  async function maybeSendGroupNotice(ctx) {
    const chatId = ctx.chat?.id ?? ctx.message?.chat?.id
    const lastNoticeAt = noticeTimes.get(chatId) ?? 0
    if (now() - lastNoticeAt < noticeCooldownMs) {
      return
    }
    noticeTimes.set(chatId, now())
    await ctx.reply(GROUP_NOTICE_TEXT)
  }
}

function isPrivateChat(ctx) {
  const chatType = ctx.chat?.type ?? ctx.message?.chat?.type
  return chatType === "private"
}

function formatGroupSettings(groupTitle, settings) {
  return [
    `${groupTitle} settings:`,
    `Reply policy: ${settings.replyPolicy}`,
    `Triggers: ${formatEnabledTriggers(settings.triggers)}`,
    `Memory: ${settings.memory.enabled ? "on" : "off"}`,
    `Context: ${settings.context.messages} messages, ${settings.context.chars} chars, ${settings.context.overlap} overlap`,
  ].join("\n")
}

function formatEnabledTriggers(triggers) {
  return Object.entries(triggers)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name)
    .join(", ")
}

function formatTriggerLabel(trigger) {
  return trigger.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)
}

function formatChars(chars) {
  return `${chars / 1_000}k`
}

function createTokenStore(limit) {
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
  }
}
