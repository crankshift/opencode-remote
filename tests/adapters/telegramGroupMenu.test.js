import { describe, expect, test, vi } from "vitest"
import { createGroupMemory } from "../../src/adapters/telegram/groupMemory.js"
import { createTelegramGroupMenu } from "../../src/adapters/telegram/groupMenu.js"
import { createMemoryGroupStore } from "../../src/adapters/telegram/groupStore.js"

describe("createTelegramGroupMenu", () => {
  test("selects a group and updates reply policy through callback buttons", async () => {
    const store = createMemoryGroupStore({ allowedChatIds: [-1001] })
    await store.upsertKnownGroup({ chatId: -1001, title: "Build Room", type: "supergroup" })
    const menu = createTelegramGroupMenu({ store, memory: createGroupMemory() })
    const reply = vi.fn(async (_text, options) => ({ reply_markup: options?.reply_markup }))

    await menu.handleCommand({
      from: { id: 123 },
      chat: { id: 123, type: "private" },
      message: { chat: { id: 123, type: "private" } },
      reply,
    })
    const selectData = reply.mock.calls[0][1].reply_markup.inline_keyboard[0][0].callback_data

    await menu.handleCallback({
      from: { id: 123 },
      match: [selectData, selectData.replace("group:", "")],
      answerCallbackQuery: vi.fn(async () => undefined),
      reply,
    })
    const settingsCall = reply.mock.calls.at(-1)
    expect(settingsCall[0]).toContain("Build Room settings")
    const replyAllButton = settingsCall[1].reply_markup.inline_keyboard
      .flat()
      .find((button) => button.text === "Reply: all")

    await menu.handleCallback({
      from: { id: 123 },
      match: [replyAllButton.callback_data, replyAllButton.callback_data.replace("group:", "")],
      answerCallbackQuery: vi.fn(async () => undefined),
      reply,
    })

    expect((await store.getSettings(-1001)).replyPolicy).toBe("all")
    expect(reply.mock.calls.at(-1)[0]).toContain("Reply policy: all")
  })

  test("updates trigger, memory, and context settings through callback buttons", async () => {
    const store = createMemoryGroupStore({ allowedChatIds: [-1001] })
    const menu = createTelegramGroupMenu({ store, memory: createGroupMemory() })
    const reply = vi.fn(async (_text, options) => ({ reply_markup: options?.reply_markup }))

    await menu.handleCommand({
      from: { id: 123 },
      chat: { id: 123, type: "private" },
      message: { chat: { id: 123, type: "private" } },
      reply,
    })
    const selectData = reply.mock.calls[0][1].reply_markup.inline_keyboard[0][0].callback_data
    await menu.handleCallback({
      from: { id: 123 },
      match: [selectData, selectData.replace("group:", "")],
      answerCallbackQuery: vi.fn(async () => undefined),
      reply,
    })
    const buttons = reply.mock.calls.at(-1)[1].reply_markup.inline_keyboard.flat()

    for (const label of ["Trigger name anywhere: off", "Memory: off", "Context messages: 50"]) {
      const button = buttons.find((candidate) => candidate.text === label)
      await menu.handleCallback({
        from: { id: 123 },
        match: [button.callback_data, button.callback_data.replace("group:", "")],
        answerCallbackQuery: vi.fn(async () => undefined),
        reply,
      })
    }

    expect(await store.getSettings(-1001)).toEqual(
      expect.objectContaining({
        triggers: expect.objectContaining({ nameAnywhere: true }),
        memory: expect.objectContaining({ enabled: false }),
        context: expect.objectContaining({ messages: 50 }),
      }),
    )
  })

  test("rejects callback tokens used by another user", async () => {
    const store = createMemoryGroupStore({ allowedChatIds: [-1001] })
    const menu = createTelegramGroupMenu({ store, memory: createGroupMemory() })
    const reply = vi.fn(async (_text, options) => ({ reply_markup: options?.reply_markup }))

    await menu.handleCommand({
      from: { id: 123 },
      chat: { id: 123, type: "private" },
      message: { chat: { id: 123, type: "private" } },
      reply,
    })
    const selectData = reply.mock.calls[0][1].reply_markup.inline_keyboard[0][0].callback_data
    const answerCallbackQuery = vi.fn(async () => undefined)

    await menu.handleCallback({
      from: { id: 456 },
      match: [selectData, selectData.replace("group:", "")],
      answerCallbackQuery,
      reply,
    })

    expect(answerCallbackQuery).toHaveBeenCalledWith({ text: "Group menu expired" })
    expect(reply).toHaveBeenCalledTimes(1)
  })
})
