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

  test("adds, removes, and clears custom triggers through DM menu", async () => {
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

    const addButton = reply.mock.calls
      .at(-1)[1]
      .reply_markup.inline_keyboard.flat()
      .find((button) => button.text === "Add custom trigger")
    await menu.handleCallback({
      from: { id: 123 },
      match: [addButton.callback_data, addButton.callback_data.replace("group:", "")],
      answerCallbackQuery: vi.fn(async () => undefined),
      reply,
    })
    expect(reply.mock.calls.at(-1)[0]).toContain("Send the custom trigger phrase")

    expect(
      await menu.handlePendingText({
        from: { id: 123 },
        chat: { id: 123, type: "private" },
        message: { text: "  Codex    please  " },
        reply,
      }),
    ).toBe(true)
    expect((await store.getSettings(-1001)).customTriggers).toEqual(["Codex please"])

    const removeButton = reply.mock.calls
      .at(-1)[1]
      .reply_markup.inline_keyboard.flat()
      .find((button) => button.text === "Remove custom trigger")
    await menu.handleCallback({
      from: { id: 123 },
      match: [removeButton.callback_data, removeButton.callback_data.replace("group:", "")],
      answerCallbackQuery: vi.fn(async () => undefined),
      reply,
    })
    const phraseButton = reply.mock.calls
      .at(-1)[1]
      .reply_markup.inline_keyboard.flat()
      .find((button) => button.text === "Codex please")
    await menu.handleCallback({
      from: { id: 123 },
      match: [phraseButton.callback_data, phraseButton.callback_data.replace("group:", "")],
      answerCallbackQuery: vi.fn(async () => undefined),
      reply,
    })
    expect((await store.getSettings(-1001)).customTriggers).toEqual([])

    await store.updateSettings(-1001, { customTriggers: ["shipbot"] })
    await menu.handleCommand({
      from: { id: 123 },
      chat: { id: 123, type: "private" },
      message: { chat: { id: 123, type: "private" } },
      reply,
    })
    const selectAgain = reply.mock.calls.at(-1)[1].reply_markup.inline_keyboard[0][0].callback_data
    await menu.handleCallback({
      from: { id: 123 },
      match: [selectAgain, selectAgain.replace("group:", "")],
      answerCallbackQuery: vi.fn(async () => undefined),
      reply,
    })
    const clearButton = reply.mock.calls
      .at(-1)[1]
      .reply_markup.inline_keyboard.flat()
      .find((button) => button.text === "Clear custom triggers")
    await menu.handleCallback({
      from: { id: 123 },
      match: [clearButton.callback_data, clearButton.callback_data.replace("group:", "")],
      answerCallbackQuery: vi.fn(async () => undefined),
      reply,
    })
    expect((await store.getSettings(-1001)).customTriggers).toEqual([])
  })

  test("rejects invalid custom trigger phrases", async () => {
    const store = createMemoryGroupStore({ allowedChatIds: [-1001] })
    await store.updateSettings(-1001, { customTriggers: ["shipbot"] })
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
    const addButton = reply.mock.calls
      .at(-1)[1]
      .reply_markup.inline_keyboard.flat()
      .find((button) => button.text === "Add custom trigger")
    await menu.handleCallback({
      from: { id: 123 },
      match: [addButton.callback_data, addButton.callback_data.replace("group:", "")],
      answerCallbackQuery: vi.fn(async () => undefined),
      reply,
    })

    expect(
      await menu.handlePendingText({
        from: { id: 123 },
        chat: { id: 123, type: "private" },
        message: { text: "SHIPBOT" },
        reply,
      }),
    ).toBe(true)

    expect(reply).toHaveBeenCalledWith("That custom trigger is already configured.")
    expect((await store.getSettings(-1001)).customTriggers).toEqual(["shipbot"])
  })
})
