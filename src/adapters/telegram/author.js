export function authorContextFromTelegramMessage(message) {
  const forwardedName = forwardedAuthorName(message?.forward_origin)
  if (forwardedName) {
    return { name: forwardedName, source: "forwarded" }
  }

  const senderChatName = telegramChatDisplayName(message?.sender_chat)
  if (senderChatName) {
    return { name: senderChatName, source: "sender" }
  }

  return {
    name: telegramUserDisplayName(message?.from) ?? "Authorized Telegram user",
    source: "sender",
  }
}

function forwardedAuthorName(origin) {
  switch (origin?.type) {
    case "user":
      return telegramUserDisplayName(origin.sender_user)
    case "hidden_user":
      return safeDisplayName(origin.sender_user_name)
    case "chat":
      return telegramChatDisplayName(origin.sender_chat)
    case "channel":
      return telegramChatDisplayName(origin.chat)
    default:
      return null
  }
}

function telegramUserDisplayName(user) {
  const fullName = safeDisplayName([user?.first_name, user?.last_name].filter(Boolean).join(" "))
  if (fullName) {
    return fullName
  }
  const username = safeDisplayName(user?.username)
  return username ? `@${username.replace(/^@/u, "")}` : null
}

function telegramChatDisplayName(chat) {
  const title = safeDisplayName(chat?.title)
  if (title) {
    return title
  }
  const username = safeDisplayName(chat?.username)
  return username ? `@${username.replace(/^@/u, "")}` : null
}

function safeDisplayName(value) {
  if (typeof value !== "string") {
    return null
  }
  const name = value.replace(/\s+/gu, " ").trim()
  return name || null
}
