import { describe, expect, test, vi } from "vitest"
import { createTelegramGroupRegistry } from "../../src/adapters/telegram/groupRegistry.js"
import { createMemoryGroupStore } from "../../src/adapters/telegram/groupStore.js"

describe("createTelegramGroupRegistry", () => {
  test("refreshes configured groups with getChat metadata", async () => {
    const store = createMemoryGroupStore({ allowedChatIds: [-1001, -1002] })
    const api = {
      getChat: vi.fn(async (chatId) => {
        if (chatId === -1002) {
          throw new Error("bot removed")
        }
        return { id: chatId, type: "supergroup", title: "Build Room", username: "build_room" }
      }),
    }
    const registry = createTelegramGroupRegistry({
      telegram: { allowedChatIds: [-1001, -1002] },
      store,
      api,
      logger: { warn: vi.fn() },
    })

    await registry.refreshAllowedGroups()

    expect(api.getChat).toHaveBeenCalledWith(-1001)
    expect(api.getChat).toHaveBeenCalledWith(-1002)
    expect(await store.listGroups()).toEqual([
      {
        chatId: -1001,
        title: "Build Room",
        username: "build_room",
        type: "supergroup",
        status: "active",
      },
      {
        chatId: -1002,
        title: "Group -1002",
        username: null,
        type: "supergroup",
        status: "unavailable",
      },
    ])
  })

  test("records group messages and membership updates", async () => {
    const store = createMemoryGroupStore()
    const registry = createTelegramGroupRegistry({
      telegram: { allowedChatIds: [-1001] },
      store,
      api: {},
      logger: { warn: vi.fn() },
    })

    await registry.recordGroupMessage({
      chat: { id: -1001, type: "supergroup", title: "Seen Room" },
    })
    await registry.handleMyChatMember({
      chat: { id: -1001, type: "supergroup", title: "Seen Room" },
      new_chat_member: { status: "left" },
    })

    expect(await store.listGroups()).toEqual([
      {
        chatId: -1001,
        title: "Seen Room",
        username: null,
        type: "supergroup",
        status: "unavailable",
      },
    ])

    await registry.handleMyChatMember({
      chat: { id: -1001, type: "supergroup", title: "Seen Room" },
      new_chat_member: { status: "administrator" },
    })

    expect(await store.listGroups()).toEqual([
      { chatId: -1001, title: "Seen Room", username: null, type: "supergroup", status: "active" },
    ])
  })
})
