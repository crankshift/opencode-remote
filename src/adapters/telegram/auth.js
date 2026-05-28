export function isAuthorizedTelegramUser(ctx, telegram) {
  const senderId = ctx?.from?.id
  if (!senderId) {
    return false
  }

  const chatId = getTelegramChatId(ctx)
  if (isPrivateTelegramChat(ctx)) {
    return ctx.from?.is_bot !== true && telegram.allowedUserIds.includes(senderId)
  }

  return telegram.allowedChatIds.includes(chatId)
}

function getTelegramChatId(ctx) {
  return ctx?.chat?.id ?? ctx?.message?.chat?.id ?? ctx?.callbackQuery?.message?.chat?.id ?? null
}

function isPrivateTelegramChat(ctx) {
  return getTelegramChatType(ctx) === "private"
}

function getTelegramChatType(ctx) {
  return (
    ctx?.chat?.type ?? ctx?.message?.chat?.type ?? ctx?.callbackQuery?.message?.chat?.type ?? null
  )
}
