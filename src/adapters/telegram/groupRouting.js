export const DEFAULT_GROUP_SETTINGS = {
  replyPolicy: "humans",
  triggers: {
    reply: true,
    mention: true,
    namePrefix: true,
    nameAnywhere: false,
    voiceName: false,
  },
}

export function evaluateGroupMessageRouting({ message, settings, botIdentity } = {}) {
  if (!message) {
    return { route: false, reason: "no_message" }
  }

  const normalizedIdentity = normalizeBotIdentity(botIdentity)
  if (normalizedIdentity.id && message.from?.id === normalizedIdentity.id) {
    return { route: false, reason: "own_message" }
  }

  const normalizedSettings = normalizeGroupSettings(settings)
  if (!senderAllowed(message, normalizedSettings.replyPolicy)) {
    return { route: false, reason: "sender_policy" }
  }

  const text = messageText(message)
  if (normalizedSettings.triggers.reply && repliesToBot(message, normalizedIdentity)) {
    return { route: true, trigger: "reply" }
  }
  if (normalizedSettings.triggers.mention && mentionsBot(text, normalizedIdentity)) {
    return { route: true, trigger: "mention" }
  }
  if (normalizedSettings.triggers.namePrefix && startsWithBotName(text, normalizedIdentity.names)) {
    return { route: true, trigger: "name_prefix" }
  }
  if (normalizedSettings.triggers.nameAnywhere && containsBotName(text, normalizedIdentity.names)) {
    return { route: true, trigger: "name_anywhere" }
  }

  return { route: false, reason: "not_addressed" }
}

export function normalizeGroupSettings(settings = {}) {
  const triggers = { ...DEFAULT_GROUP_SETTINGS.triggers, ...(settings.triggers ?? {}) }
  return {
    ...DEFAULT_GROUP_SETTINGS,
    ...settings,
    triggers,
  }
}

function senderAllowed(message, replyPolicy) {
  switch (replyPolicy) {
    case "off":
      return false
    case "bots":
      return message.from?.is_bot === true
    case "all":
      return true
    default:
      return message.from?.is_bot !== true
  }
}

function repliesToBot(message, botIdentity) {
  const repliedSenderId = message.reply_to_message?.from?.id
  return Boolean(botIdentity.id && repliedSenderId === botIdentity.id)
}

function mentionsBot(text, botIdentity) {
  if (!text || !botIdentity.username) {
    return false
  }
  return new RegExp(
    `(^|[^\\p{Letter}\\p{Number}_])@${escapeRegex(botIdentity.username)}\\b`,
    "iu",
  ).test(text)
}

function startsWithBotName(text, names) {
  if (!text) {
    return false
  }
  const trimmed = text.trimStart()
  return names.some((name) => {
    const pattern = new RegExp(`^${escapeRegex(name)}(?:$|[\\s,.:;!?\\-—])`, "iu")
    return pattern.test(trimmed)
  })
}

function containsBotName(text, names) {
  if (!text) {
    return false
  }
  return names.some((name) => {
    const pattern = new RegExp(
      `(^|[^\\p{Letter}\\p{Number}_])${escapeRegex(name)}($|[^\\p{Letter}\\p{Number}_])`,
      "iu",
    )
    return pattern.test(text)
  })
}

function normalizeBotIdentity(identity = {}) {
  const username = normalizeUsername(identity.username)
  const names = uniqueStrings([
    identity.firstName,
    identity.name,
    username,
    ...(Array.isArray(identity.aliases) ? identity.aliases : []),
  ])
  return {
    id: Number.isInteger(identity.id) ? identity.id : null,
    username,
    names,
  }
}

function normalizeUsername(username) {
  const normalized = String(username ?? "")
    .replace(/^@/u, "")
    .trim()
  return normalized || null
}

function uniqueStrings(values) {
  const result = []
  const seen = new Set()
  for (const value of values) {
    const text = String(value ?? "").trim()
    const key = text.toLocaleLowerCase("en-US")
    if (!text || seen.has(key)) {
      continue
    }
    seen.add(key)
    result.push(text)
  }
  return result
}

function messageText(message) {
  return String(message?.text ?? message?.caption ?? "")
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
