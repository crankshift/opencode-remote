import { authorContextFromTelegramMessage } from "./author.js"
import { evaluateGroupMessageRouting } from "./groupRouting.js"

export function createTelegramGroupPromptHelper({
  groupStore,
  groupMemory,
  groupRegistry,
  controller,
  botIdentity = {},
  logger,
} = {}) {
  const scopeLogTokens = createScopeLogTokens()

  return {
    async prepareText(ctx) {
      await rememberKnownGroup(ctx.message)
      const settings = await groupStore.getSettings(ctx.message.chat.id)
      const scope = await groupMemoryScope(ctx.message)
      const decision = evaluateGroupMessageRouting({
        message: ctx.message,
        settings,
        botIdentity: botIdentityForContext(ctx),
      })

      if (!decision.route) {
        const currentRecord = rememberText(scope, ctx.message, settings)
        logGroupMemoryDecision({
          message: ctx.message,
          kind: "text",
          settings,
          decision,
          scope,
          currentRecord,
        })
        return { route: false }
      }

      const contextCandidateEntries = countScopeEntries(scope)
      const context = buildContext(scope, settings, ctx.message.message_id)
      const currentRecord = rememberText(scope, ctx.message, settings)
      logGroupMemoryDecision({
        message: ctx.message,
        kind: "text",
        settings,
        decision,
        scope,
        currentRecord,
        context,
        contextCandidateEntries,
      })
      return routedPrompt(scope, currentRecord, context)
    },

    async preparePhoto(ctx, messages) {
      const message = messages[0]
      await rememberKnownGroup(message)
      const settings = await groupStore.getSettings(message.chat.id)
      const scope = await groupMemoryScope(message)
      const decision = evaluateGroupMessageRouting({
        message: { ...message, text: captionTextForRouting(messages) },
        settings,
        botIdentity: botIdentityForContext(ctx),
      })

      if (!decision.route) {
        const currentRecord = rememberPhoto(scope, messages, settings)
        logGroupMemoryDecision({
          message,
          kind: "photo",
          settings,
          decision,
          scope,
          currentRecord,
        })
        return { route: false }
      }

      const contextCandidateEntries = countScopeEntries(scope)
      const context = buildContext(scope, settings, message.message_id)
      const currentRecord = rememberPhoto(scope, messages, settings)
      logGroupMemoryDecision({
        message,
        kind: "photo",
        settings,
        decision,
        scope,
        currentRecord,
        context,
        contextCandidateEntries,
      })
      return routedPrompt(scope, currentRecord, context)
    },

    async prepareSticker(ctx) {
      await rememberKnownGroup(ctx.message)
      const settings = await groupStore.getSettings(ctx.message.chat.id)
      const scope = await groupMemoryScope(ctx.message)
      const decision = evaluateGroupMessageRouting({
        message: ctx.message,
        settings,
        botIdentity: botIdentityForContext(ctx),
      })

      if (!decision.route) {
        const currentRecord = rememberSticker(scope, ctx.message, settings)
        logGroupMemoryDecision({
          message: ctx.message,
          kind: "sticker",
          settings,
          decision,
          scope,
          currentRecord,
        })
        return { route: false }
      }

      const contextCandidateEntries = countScopeEntries(scope)
      const context = buildContext(scope, settings, ctx.message.message_id)
      const currentRecord = rememberSticker(scope, ctx.message, settings)
      logGroupMemoryDecision({
        message: ctx.message,
        kind: "sticker",
        settings,
        decision,
        scope,
        currentRecord,
        context,
        contextCandidateEntries,
      })
      return routedPrompt(scope, currentRecord, context)
    },

    async prepareVoice(ctx, transcript) {
      await rememberKnownGroup(ctx.message)
      const settings = await groupStore.getSettings(ctx.message.chat.id)
      const scope = await groupMemoryScope(ctx.message)
      const messageWithTranscript = { ...ctx.message, text: transcript }
      const decision = evaluateGroupMessageRouting({
        message: messageWithTranscript,
        settings,
        botIdentity: botIdentityForContext(ctx),
      })

      if (!decision.route) {
        const currentRecord = rememberTranscript(scope, ctx.message, transcript, settings)
        logGroupMemoryDecision({
          message: ctx.message,
          kind: "voice",
          settings,
          decision,
          scope,
          currentRecord,
        })
        return { route: false }
      }

      const contextCandidateEntries = countScopeEntries(scope)
      const context = buildContext(scope, settings, ctx.message.message_id)
      const currentRecord = rememberTranscript(scope, ctx.message, transcript, settings)
      logGroupMemoryDecision({
        message: ctx.message,
        kind: "voice",
        settings,
        decision,
        scope,
        currentRecord,
        context,
        contextCandidateEntries,
      })
      return routedPrompt(scope, currentRecord, context)
    },

    complete(scope, currentRecord, replyText) {
      if (!scope || !currentRecord) {
        return
      }
      groupMemory.markPromptCursor(scope, currentRecord.id)
      if (!String(replyText ?? "").trim()) {
        return
      }
      groupMemory.record(scope, {
        author: botIdentity.firstName ?? botIdentity.username ?? "OpenCode Remote",
        text: replyText,
        kind: "bot_reply",
        timestamp: Date.now(),
      })
    },

    withContext(text, contextText) {
      if (!String(contextText ?? "").trim()) {
        return text
      }
      return [
        "Recent Telegram group context:",
        contextText,
        "",
        "Current addressed message:",
        text,
      ].join("\n")
    },
  }

  async function rememberKnownGroup(message) {
    if (typeof groupRegistry?.recordGroupMessage === "function") {
      await groupRegistry.recordGroupMessage(message)
      return
    }
    if (typeof groupStore?.upsertKnownGroup !== "function") {
      return
    }
    const chat = message?.chat
    if (!chat?.id) {
      return
    }
    await groupStore.upsertKnownGroup({
      chatId: chat.id,
      title: chat.title ?? chat.username ?? `Group ${chat.id}`,
      username: chat.username ?? null,
      type: chat.type ?? "supergroup",
      status: "active",
    })
  }

  async function groupMemoryScope(message) {
    let sessionId = "active"
    try {
      sessionId = (await controller.status?.())?.activeSessionId ?? sessionId
    } catch (error) {
      logger?.warn?.({ error }, "Could not read active session for Telegram group memory")
    }
    return {
      chatId: message.chat.id,
      threadId: message.message_thread_id ?? null,
      sessionId,
    }
  }

  function buildContext(scope, settings, currentMessageId) {
    return settings.memory?.enabled === false
      ? { text: "" }
      : groupMemory.buildContext(scope, {
          currentMessageId,
          contextMessages: settings.context?.messages,
          contextChars: settings.context?.chars,
          overlap: settings.context?.overlap,
        })
  }

  function countScopeEntries(scope) {
    if (typeof groupMemory?.snapshot !== "function") {
      return 0
    }
    return groupMemory.snapshot(scope).length
  }

  function routedPrompt(scope, currentRecord, context) {
    return {
      route: true,
      scope,
      currentRecord,
      contextText: context.text,
    }
  }

  function rememberText(scope, message, settings) {
    return rememberEntry(scope, message, settings, {
      text: message.text,
      kind: "text",
    })
  }

  function rememberSticker(scope, message, settings) {
    const sticker = message.sticker
    const pack = sticker?.set_name ? ` from ${sticker.set_name}` : ""
    const emoji = sticker?.emoji ? ` ${sticker.emoji}` : ""
    return rememberEntry(scope, message, settings, {
      text: `sent sticker${emoji}${pack}`,
      kind: "sticker",
    })
  }

  function rememberTranscript(scope, message, transcript, settings) {
    return rememberEntry(scope, message, settings, {
      text: transcript,
      kind: "voice",
    })
  }

  function rememberPhoto(scope, messages, settings) {
    const message = messages[0]
    const caption = captionTextForRouting(messages)
    const album = messages.length > 1 ? " album" : ""
    return rememberEntry(scope, message, settings, {
      text: caption ? `sent photo${album}: ${caption}` : `sent photo${album}`,
      kind: "photo",
    })
  }

  function rememberEntry(scope, message, settings, entry) {
    if (settings?.memory?.enabled === false) {
      return null
    }
    const author = authorContextFromTelegramMessage(message)
    return groupMemory.record(scope, {
      messageId: message.message_id,
      author: author.name,
      text: entry.text,
      kind: entry.kind,
      timestamp: message.date ? message.date * 1000 : Date.now(),
    })
  }

  function logGroupMemoryDecision({
    message,
    kind,
    settings,
    decision,
    scope,
    currentRecord,
    context,
    contextCandidateEntries = 0,
  }) {
    logger?.debug?.(
      {
        ...scopeLogContext(scope),
        chatType: message?.chat?.type ?? "unknown",
        contextCandidateEntries,
        contextEntries: context?.entries?.length ?? 0,
        hasThread: Number.isInteger(scope?.threadId),
        memoryEnabled: settings?.memory?.enabled !== false,
        messageKind: kind,
        remembered: Boolean(currentRecord),
        route: decision?.route === true,
        routeReason: decision?.reason ?? null,
        routeTrigger: decision?.trigger ?? null,
        scopeEntryCount: countScopeEntries(scope),
        senderKind: senderKind(message),
        sessionScoped: scope?.sessionId !== "active",
      },
      "Telegram group memory decision",
    )
  }

  function scopeLogContext(scope) {
    return {
      chatScope: scopeLogTokens.token("chat", scope?.chatId ?? "unknown"),
      sessionScope:
        scope?.sessionId === "active"
          ? "active"
          : scopeLogTokens.token("session", scope?.sessionId),
      threadScope:
        scope?.threadId == null ? "main" : scopeLogTokens.token("thread", scope?.threadId),
    }
  }

  function senderKind(message) {
    if (message?.from?.is_bot === true) {
      return "bot"
    }
    if (message?.from?.is_bot === false) {
      return "human"
    }
    if (message?.sender_chat) {
      return "chat"
    }
    return "unknown"
  }

  function botIdentityForContext(ctx) {
    return {
      ...botIdentity,
      id: botIdentity.id ?? ctx.me?.id,
      username: botIdentity.username ?? ctx.me?.username,
      firstName: botIdentity.firstName ?? ctx.me?.first_name ?? ctx.me?.firstName,
    }
  }
}

function createScopeLogTokens() {
  const tokenMaps = new Map()
  return {
    token(kind, value) {
      const map = getTokenMap(kind)
      const key = String(value ?? "unknown")
      if (!map.has(key)) {
        map.set(key, `${kind}:${map.size + 1}`)
      }
      return map.get(key)
    },
  }

  function getTokenMap(kind) {
    if (!tokenMaps.has(kind)) {
      tokenMaps.set(kind, new Map())
    }
    return tokenMaps.get(kind)
  }
}

function captionTextForRouting(messages) {
  return messages
    .map((message) => String(message?.caption ?? "").trim())
    .filter(Boolean)
    .join("\n")
}
