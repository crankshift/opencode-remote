const DEFAULT_LIMITS = {
  storeMessages: 200,
  storeChars: 50_000,
  contextMessages: 30,
  contextChars: 12_000,
  overlap: 5,
  maxEntryChars: 1_000,
}

export function createGroupMemory(options = {}) {
  const limits = normalizeLimits(options)
  const scopes = new Map()
  const cursors = new Map()
  let nextId = 1

  return {
    record(scope, entry) {
      const key = scopeKey(scope)
      const record = normalizeEntry(entry, nextId)
      nextId += 1
      const entries = scopes.get(key) ?? []
      entries.push(record)
      scopes.set(key, pruneEntries(entries, limits))
      return record
    },

    buildContext(scope, options = {}) {
      const contextLimits = normalizeContextLimits(limits, options)
      const key = scopeKey(scope)
      const entries = scopes.get(key) ?? []
      const cursorId = cursors.get(key)
      const cursorIndex = entries.findIndex((entry) => entry.id === cursorId)
      const startIndex = cursorIndex >= 0 ? Math.max(0, cursorIndex - contextLimits.overlap + 1) : 0
      const selected = entries
        .slice(startIndex)
        .filter((entry) => entry.messageId !== options.currentMessageId)
        .slice(-contextLimits.contextMessages)
      const capped = fitContextEntries(selected, contextLimits)
      return { entries: capped, text: formatContextText(capped, contextLimits) }
    },

    markPromptCursor(scope, id) {
      cursors.set(scopeKey(scope), id)
    },

    snapshot(scope) {
      return [...(scopes.get(scopeKey(scope)) ?? [])]
    },

    clearScope(scope) {
      const key = scopeKey(scope)
      scopes.delete(key)
      cursors.delete(key)
    },

    clearChat(chatId) {
      const prefix = `${chatId}:`
      for (const key of [...scopes.keys()]) {
        if (key.startsWith(prefix)) {
          scopes.delete(key)
          cursors.delete(key)
        }
      }
    },

    clearAll() {
      scopes.clear()
      cursors.clear()
    },
  }
}

function normalizeLimits(options) {
  return {
    storeMessages: boundedInteger(options.storeMessages, DEFAULT_LIMITS.storeMessages, 1, 1_000),
    storeChars: boundedInteger(options.storeChars, DEFAULT_LIMITS.storeChars, 1, 200_000),
    contextMessages: boundedInteger(
      options.contextMessages,
      DEFAULT_LIMITS.contextMessages,
      1,
      100,
    ),
    contextChars: boundedInteger(options.contextChars, DEFAULT_LIMITS.contextChars, 1, 40_000),
    overlap: boundedInteger(options.overlap, DEFAULT_LIMITS.overlap, 0, 20),
    maxEntryChars: boundedInteger(options.maxEntryChars, DEFAULT_LIMITS.maxEntryChars, 1, 4_000),
  }
}

function normalizeContextLimits(base, options) {
  return {
    ...base,
    contextMessages: boundedInteger(options.contextMessages, base.contextMessages, 1, 100),
    contextChars: boundedInteger(options.contextChars, base.contextChars, 1, 40_000),
    overlap: boundedInteger(options.overlap, base.overlap, 0, 20),
    maxEntryChars: boundedInteger(options.maxEntryChars, base.maxEntryChars, 1, 4_000),
  }
}

function boundedInteger(value, fallback, min, max) {
  const number = Number(value)
  if (!Number.isInteger(number)) {
    return fallback
  }
  return Math.min(max, Math.max(min, number))
}

function normalizeEntry(entry, id) {
  return {
    id,
    messageId: Number.isInteger(entry?.messageId) ? entry.messageId : null,
    author: safeText(entry?.author, "Unknown"),
    text: safeText(entry?.text, ""),
    kind: safeText(entry?.kind, "text"),
    timestamp: Number.isFinite(entry?.timestamp) ? entry.timestamp : Date.now(),
  }
}

function safeText(value, fallback) {
  const text = String(value ?? "")
    .replace(/\s+/gu, " ")
    .trim()
  return text || fallback
}

function pruneEntries(entries, limits) {
  const pruned = entries.slice(-limits.storeMessages)
  while (totalEntryChars(pruned) > limits.storeChars && pruned.length > 0) {
    pruned.shift()
  }
  return pruned
}

function totalEntryChars(entries) {
  return entries.reduce((total, entry) => total + entry.text.length, 0)
}

function fitContextEntries(entries, limits) {
  const result = []
  for (const entry of entries.slice().reverse()) {
    const candidate = [entry, ...result]
    if (formatContextText(candidate, limits).length > limits.contextChars) {
      continue
    }
    result.unshift(entry)
  }
  return result
}

function formatContextText(entries, limits) {
  return entries
    .map((entry) => `${entry.author}: ${truncateText(entry.text, limits.maxEntryChars)}`)
    .join("\n")
}

function truncateText(text, limit) {
  if (text.length <= limit) {
    return text
  }
  return `${text.slice(0, limit)}...`
}

function scopeKey(scope = {}) {
  return [scope.chatId ?? "chat", scope.threadId ?? "main", scope.sessionId ?? "session"].join(":")
}
