import { InlineKeyboard } from "grammy"
import {
  CUSTOM_TRIGGER_MAX_COUNT,
  CUSTOM_TRIGGER_MAX_LENGTH,
  normalizeCustomTriggerPhrase,
} from "./groupRouting.js"

const GROUP_NOTICE_TEXT = "Group settings are managed in DM. Message me and run /group."

export function createTelegramGroupMenu({
  store,
  memory,
  allowedChatIds,
  noticeCooldownMs = 10 * 60 * 1000,
  now = Date.now,
} = {}) {
  const noticeTimes = new Map()
  const groupTokens = createTokenStore(200)
  const pendingCustomTriggerAdds = new Map()

  return {
    async handleCommand(ctx) {
      if (!isPrivateChat(ctx)) {
        await maybeSendGroupNotice(ctx)
        return
      }

      await pruneUnallowedGroups()
      const groups = filterAllowedGroups(
        typeof store?.listGroups === "function" ? await store.listGroups() : [],
      )
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

    async handlePendingText(ctx) {
      return handlePendingCustomTriggerText(ctx)
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
        await replyWithReplyBehaviorMenu(ctx, selection.chatId, selection.userId)
        return
      }
      if (selection.action === "open_reply") {
        await ctx.answerCallbackQuery({ text: "Reply behavior" })
        await replyWithReplyBehaviorMenu(ctx, selection.chatId, selection.userId)
        return
      }
      if (selection.action === "open_triggers") {
        await ctx.answerCallbackQuery({ text: "Triggers" })
        await replyWithTriggersMenu(ctx, selection.chatId, selection.userId)
        return
      }
      if (selection.action === "open_custom_triggers") {
        await ctx.answerCallbackQuery({ text: "Custom triggers" })
        await replyWithCustomTriggersMenu(ctx, selection.chatId, selection.userId)
        return
      }
      if (selection.action === "open_memory") {
        await ctx.answerCallbackQuery({ text: "Memory and context" })
        await replyWithMemoryContextMenu(ctx, selection.chatId, selection.userId)
        return
      }
      if (selection.action === "back_hub") {
        await ctx.answerCallbackQuery({ text: "Group settings" })
        await replyWithGroupHub(ctx, selection.chatId, selection.userId)
        return
      }
      if (selection.action === "toggle_trigger") {
        const settings = await store.getSettings(selection.chatId)
        await store.updateSettings(selection.chatId, {
          triggers: { [selection.trigger]: !settings.triggers[selection.trigger] },
        })
        await ctx.answerCallbackQuery({ text: "Trigger updated" })
        await replyWithTriggersMenu(ctx, selection.chatId, selection.userId)
        return
      }
      if (selection.action === "toggle_memory") {
        const settings = await store.getSettings(selection.chatId)
        await store.updateSettings(selection.chatId, {
          memory: { enabled: !settings.memory.enabled },
        })
        await ctx.answerCallbackQuery({ text: "Memory updated" })
        await replyWithMemoryContextMenu(ctx, selection.chatId, selection.userId)
        return
      }
      if (selection.action === "context_messages") {
        await store.updateSettings(selection.chatId, { context: { messages: selection.messages } })
        await ctx.answerCallbackQuery({ text: "Context messages updated" })
        await replyWithMemoryContextMenu(ctx, selection.chatId, selection.userId)
        return
      }
      if (selection.action === "context_chars") {
        await store.updateSettings(selection.chatId, { context: { chars: selection.chars } })
        await ctx.answerCallbackQuery({ text: "Context chars updated" })
        await replyWithMemoryContextMenu(ctx, selection.chatId, selection.userId)
        return
      }
      if (selection.action === "clear_memory") {
        memory?.clearChat?.(selection.chatId)
        await ctx.answerCallbackQuery({ text: "Group memory cleared" })
        await replyWithGroupHub(ctx, selection.chatId, selection.userId)
        return
      }
      if (selection.action === "add_custom_trigger") {
        pendingCustomTriggerAdds.set(selection.userId, { chatId: selection.chatId })
        await ctx.answerCallbackQuery({ text: "Send trigger phrase" })
        await ctx.reply(
          [
            "Add custom trigger",
            "",
            "Send the phrase people can type in this group to route a message to OpenCode.",
            `Max length: ${CUSTOM_TRIGGER_MAX_LENGTH} characters.`,
            "Examples: codex please, remote",
            "",
            "Send /cancel to stop.",
          ].join("\n"),
        )
        return
      }
      if (selection.action === "remove_custom_trigger") {
        await ctx.answerCallbackQuery({ text: "Select trigger" })
        await replyWithCustomTriggerRemoveMenu(ctx, selection.chatId, selection.userId)
        return
      }
      if (selection.action === "remove_custom_trigger_phrase") {
        const settings = await store.getSettings(selection.chatId)
        const key = customTriggerKey(selection.phrase)
        await store.updateSettings(selection.chatId, {
          customTriggers: settings.customTriggers.filter(
            (phrase) => customTriggerKey(phrase) !== key,
          ),
        })
        await ctx.answerCallbackQuery({ text: "Custom trigger removed" })
        await replyWithCustomTriggersMenu(ctx, selection.chatId, selection.userId)
        return
      }
      if (selection.action === "clear_custom_triggers") {
        await store.updateSettings(selection.chatId, { customTriggers: [] })
        await ctx.answerCallbackQuery({ text: "Custom triggers cleared" })
        await replyWithCustomTriggersMenu(ctx, selection.chatId, selection.userId)
        return
      }

      await ctx.answerCallbackQuery({ text: "Group selected" })
      await replyWithGroupHub(ctx, selection.chatId, selection.userId)
    },
  }

  async function replyWithGroupHub(ctx, chatId, userId) {
    const settings = await store.getSettings(chatId)
    const keyboard = new InlineKeyboard()
    keyboard
      .text(
        "Who the bot answers",
        `group:${groupTokens.add({ action: "open_reply", chatId, userId })}`,
      )
      .row()
    keyboard
      .text(
        "What triggers replies",
        `group:${groupTokens.add({ action: "open_triggers", chatId, userId })}`,
      )
      .row()
    keyboard
      .text(
        "Custom trigger phrases",
        `group:${groupTokens.add({ action: "open_custom_triggers", chatId, userId })}`,
      )
      .row()
    keyboard
      .text(
        "Temporary memory",
        `group:${groupTokens.add({ action: "open_memory", chatId, userId })}`,
      )
      .row()
    keyboard.text(
      "Clear temporary memory",
      `group:${groupTokens.add({ action: "clear_memory", chatId, userId })}`,
    )
    await ctx.reply(formatGroupHub(await groupTitle(chatId), settings), {
      reply_markup: keyboard,
    })
  }

  async function replyWithReplyBehaviorMenu(ctx, chatId, userId) {
    const settings = await store.getSettings(chatId)
    const keyboard = new InlineKeyboard()
    for (const [replyPolicy, label] of [
      ["off", "Do not answer group messages"],
      ["humans", "Answer humans only"],
      ["bots", "Answer bots only"],
      ["all", "Answer everyone"],
    ]) {
      keyboard
        .text(label, `group:${groupTokens.add({ action: "reply", chatId, userId, replyPolicy })}`)
        .row()
    }
    keyboard.text("Back", `group:${groupTokens.add({ action: "back_hub", chatId, userId })}`)
    await ctx.reply(
      [
        `${await groupTitle(chatId)} reply behavior`,
        "Who should the bot answer in this group?",
        `Current: ${settings.replyPolicy}`,
      ].join("\n"),
      { reply_markup: keyboard },
    )
  }

  async function replyWithTriggersMenu(ctx, chatId, userId) {
    const settings = await store.getSettings(chatId)
    const keyboard = new InlineKeyboard()
    for (const trigger of ["reply", "mention", "namePrefix", "nameAnywhere"]) {
      const enabled = Boolean(settings.triggers[trigger])
      const action = enabled ? "Disable" : "Enable"
      const token = groupTokens.add({ action: "toggle_trigger", chatId, userId, trigger })
      keyboard.text(`${action} ${formatTriggerLabel(trigger)}`, `group:${token}`).row()
    }
    keyboard.text("Back", `group:${groupTokens.add({ action: "back_hub", chatId, userId })}`)
    await ctx.reply(
      [
        `${await groupTitle(chatId)} triggers`,
        "Choose what makes a group message address the bot.",
        `Current: ${formatEnabledTriggers(settings.triggers)}`,
      ].join("\n"),
      { reply_markup: keyboard },
    )
  }

  async function replyWithCustomTriggersMenu(ctx, chatId, userId) {
    const settings = await store.getSettings(chatId)
    const keyboard = new InlineKeyboard()
    keyboard
      .text(
        "Add trigger phrase",
        `group:${groupTokens.add({ action: "add_custom_trigger", chatId, userId })}`,
      )
      .row()
    if (settings.customTriggers.length > 0) {
      keyboard
        .text(
          "Remove trigger phrase",
          `group:${groupTokens.add({ action: "remove_custom_trigger", chatId, userId })}`,
        )
        .row()
      keyboard
        .text(
          "Remove all trigger phrases",
          `group:${groupTokens.add({ action: "clear_custom_triggers", chatId, userId })}`,
        )
        .row()
    }
    keyboard.text("Back", `group:${groupTokens.add({ action: "back_hub", chatId, userId })}`)
    await ctx.reply(
      [
        `${await groupTitle(chatId)} custom triggers`,
        "Custom trigger phrases route group messages to OpenCode when they appear as bounded words or phrases.",
        `Configured: ${formatCustomTriggers(settings.customTriggers)}`,
        `Remaining: ${Math.max(0, CUSTOM_TRIGGER_MAX_COUNT - settings.customTriggers.length)} phrases`,
      ].join("\n"),
      { reply_markup: keyboard },
    )
  }

  async function replyWithMemoryContextMenu(ctx, chatId, userId) {
    const settings = await store.getSettings(chatId)
    const keyboard = new InlineKeyboard()
    keyboard
      .text(
        settings.memory.enabled ? "Disable memory" : "Enable memory",
        `group:${groupTokens.add({ action: "toggle_memory", chatId, userId })}`,
      )
      .row()
    for (const messages of [10, 30, 50]) {
      const token = groupTokens.add({ action: "context_messages", chatId, userId, messages })
      keyboard.text(`Keep last ${messages} messages`, `group:${token}`).row()
    }
    for (const chars of [4_000, 12_000, 24_000]) {
      const token = groupTokens.add({ action: "context_chars", chatId, userId, chars })
      keyboard.text(`Use ${formatChars(chars)} chars`, `group:${token}`).row()
    }
    keyboard.text("Back", `group:${groupTokens.add({ action: "back_hub", chatId, userId })}`)
    await ctx.reply(
      [
        `${await groupTitle(chatId)} memory and context`,
        "Memory is temporary and clears on restart or session changes.",
        `Memory: ${settings.memory.enabled ? "on" : "off"}`,
        `Context: ${settings.context.messages} messages, ${settings.context.chars} chars`,
      ].join("\n"),
      { reply_markup: keyboard },
    )
  }

  async function replyWithCustomTriggerRemoveMenu(ctx, chatId, userId) {
    const settings = await store.getSettings(chatId)
    if (settings.customTriggers.length === 0) {
      await ctx.reply("No custom triggers are configured for this group.")
      return
    }
    const keyboard = new InlineKeyboard()
    for (const phrase of settings.customTriggers) {
      const token = groupTokens.add({
        action: "remove_custom_trigger_phrase",
        chatId,
        userId,
        phrase,
      })
      keyboard.text(phrase, `group:${token}`).row()
    }
    await ctx.reply("Select a custom trigger to remove:", { reply_markup: keyboard })
  }

  async function handlePendingCustomTriggerText(ctx) {
    if (!isPrivateChat(ctx)) {
      return false
    }
    const userId = ctx.from?.id
    const pending = pendingCustomTriggerAdds.get(userId)
    if (!pending) {
      return false
    }
    const text = String(ctx.message?.text ?? "")
    if (text.trim() === "/cancel") {
      pendingCustomTriggerAdds.delete(userId)
      await ctx.reply("Custom trigger setup cancelled.")
      return true
    }
    const rawPhrase = text.trim().replace(/\s+/g, " ")
    if (!rawPhrase) {
      await ctx.reply("Custom trigger cannot be empty. Send another phrase or /cancel.")
      return true
    }
    if (rawPhrase.length > CUSTOM_TRIGGER_MAX_LENGTH) {
      await ctx.reply(`Custom trigger must be ${CUSTOM_TRIGGER_MAX_LENGTH} characters or fewer.`)
      return true
    }
    const settings = await store.getSettings(pending.chatId)
    if (settings.customTriggers.length >= CUSTOM_TRIGGER_MAX_COUNT) {
      pendingCustomTriggerAdds.delete(userId)
      await ctx.reply(`This group already has ${CUSTOM_TRIGGER_MAX_COUNT} custom triggers.`)
      return true
    }
    const phrase = normalizeCustomTriggerPhrase(rawPhrase)
    if (
      settings.customTriggers.some(
        (existing) => customTriggerKey(existing) === customTriggerKey(phrase),
      )
    ) {
      await ctx.reply("That custom trigger is already configured.")
      return true
    }
    pendingCustomTriggerAdds.delete(userId)
    await store.updateSettings(pending.chatId, {
      customTriggers: [...settings.customTriggers, phrase],
    })
    await ctx.reply(`Added custom trigger: ${phrase}`)
    await replyWithCustomTriggersMenu(ctx, pending.chatId, userId)
    return true
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

  async function groupTitle(chatId) {
    const groups = typeof store?.listGroups === "function" ? await store.listGroups() : []
    return groups.find((candidate) => candidate.chatId === chatId)?.title ?? `Group ${chatId}`
  }

  async function pruneUnallowedGroups() {
    if (!Array.isArray(allowedChatIds) || typeof store?.pruneUnallowedGroups !== "function") {
      return
    }
    await store.pruneUnallowedGroups(allowedChatIds)
  }

  function filterAllowedGroups(groups) {
    if (!Array.isArray(allowedChatIds)) {
      return groups
    }
    const allowed = new Set(allowedChatIds.filter(Number.isInteger))
    if (allowed.size === 0) {
      return []
    }
    return groups.filter((group) => allowed.has(group.chatId))
  }
}

function isPrivateChat(ctx) {
  const chatType = ctx.chat?.type ?? ctx.message?.chat?.type
  return chatType === "private"
}

function formatGroupHub(groupTitle, settings) {
  return [
    `${groupTitle} settings`,
    `Reply behavior: ${settings.replyPolicy}`,
    `Triggers: ${formatEnabledTriggers(settings.triggers)}`,
    `Custom triggers: ${formatCustomTriggers(settings.customTriggers)}`,
    `Memory: ${settings.memory.enabled ? "on" : "off"}`,
    `Context: ${settings.context.messages} messages, ${settings.context.chars} chars, ${settings.context.overlap} overlap`,
  ].join("\n")
}

function formatCustomTriggers(customTriggers = []) {
  return customTriggers.length === 0 ? "none" : customTriggers.join(", ")
}

function customTriggerKey(value) {
  return String(value ?? "").toLocaleLowerCase("en-US")
}

function formatEnabledTriggers(triggers) {
  return Object.entries(triggers)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name)
    .join(", ")
}

function formatTriggerLabel(trigger) {
  if (trigger === "mention") {
    return "@mention"
  }
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
