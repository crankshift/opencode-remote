export function createTelegramGroupRegistry({ telegram, store, api, logger } = {}) {
  const allowedChatIds = new Set(telegram?.allowedChatIds ?? [])
  let currentApi = api

  return {
    setApi(api) {
      currentApi = api
    },

    async refreshAllowedGroups() {
      for (const chatId of allowedChatIds) {
        try {
          const chat = await currentApi?.getChat?.(chatId)
          if (chat) {
            await store.upsertKnownGroup(groupFromTelegramChat(chat, "active"))
          }
        } catch (error) {
          logger?.warn?.({ error, chatId }, "Could not refresh Telegram group metadata")
          await store.markGroupUnavailable(chatId)
        }
      }
    },

    async recordGroupMessage(message) {
      const chat = message?.chat
      if (!isAllowedGroup(chat?.id, allowedChatIds)) {
        return
      }
      await store.upsertKnownGroup(groupFromTelegramChat(chat, "active"))
    },

    async handleMyChatMember(update) {
      const chat = update?.chat
      if (!isAllowedGroup(chat?.id, allowedChatIds)) {
        return
      }
      const status = update?.new_chat_member?.status
      if (status === "left" || status === "kicked") {
        await store.upsertKnownGroup(groupFromTelegramChat(chat, "unavailable"))
        return
      }
      if (["member", "administrator", "creator"].includes(status)) {
        await store.upsertKnownGroup(groupFromTelegramChat(chat, "active"))
      }
    },
  }
}

function groupFromTelegramChat(chat, status) {
  return {
    chatId: chat.id,
    title: chat.title ?? chat.username ?? `Group ${chat.id}`,
    username: chat.username ?? null,
    type: chat.type ?? "supergroup",
    status,
  }
}

function isAllowedGroup(chatId, allowedChatIds) {
  return Number.isInteger(chatId) && allowedChatIds.has(chatId)
}
