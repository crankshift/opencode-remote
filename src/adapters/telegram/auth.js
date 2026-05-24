export function isAuthorizedTelegramUser(ctx, allowedUserId) {
  return ctx?.from?.id === allowedUserId
}
