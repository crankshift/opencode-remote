import { describe, expect, test, vi } from "vitest"
import { createGroupMemory } from "../../src/adapters/telegram/groupMemory.js"
import { createTelegramGroupMenu } from "../../src/adapters/telegram/groupMenu.js"
import { createMemoryGroupStore } from "../../src/adapters/telegram/groupStore.js"

describe("createTelegramGroupMenu", () => {
  test("prunes stale known groups before rendering the DM group menu", async () => {
    const store = createMemoryGroupStore({ allowedChatIds: [-1001, -1002] })
    await store.upsertKnownGroup({ chatId: -1001, title: "Old Room", type: "supergroup" })
    await store.upsertKnownGroup({ chatId: -1002, title: "Build Room", type: "supergroup" })
    await store.updateSettings(-1001, { customTriggers: ["oldbot"] })
    const menu = createTelegramGroupMenu({
      store,
      memory: createGroupMemory(),
      allowedChatIds: [-1002],
    })
    const reply = vi.fn(async (_text, options) => ({ reply_markup: options?.reply_markup }))

    await menu.handleCommand({
      from: { id: 123 },
      chat: { id: 123, type: "private" },
      message: { chat: { id: 123, type: "private" } },
      reply,
    })

    expect(reply.mock.calls[0][0]).toBe("Select a Telegram group to configure:")
    expect(
      reply.mock.calls[0][1].reply_markup.inline_keyboard.flat().map((button) => button.text),
    ).toEqual(["Build Room"])
    expect(await store.listGroups()).toEqual([
      {
        chatId: -1002,
        title: "Build Room",
        username: null,
        type: "supergroup",
        status: "active",
      },
    ])
  })

  test("hides groups without deleting them when no allowed chat IDs are configured", async () => {
    const store = createMemoryGroupStore({ allowedChatIds: [-1001] })
    await store.upsertKnownGroup({ chatId: -1001, title: "Old Room", type: "supergroup" })
    const menu = createTelegramGroupMenu({
      store,
      memory: createGroupMemory(),
      allowedChatIds: [],
    })
    const reply = vi.fn(async () => undefined)

    await menu.handleCommand({
      from: { id: 123 },
      chat: { id: 123, type: "private" },
      message: { chat: { id: 123, type: "private" } },
      reply,
    })

    expect(reply).toHaveBeenCalledWith("No known Telegram groups are configured for this gateway.")
    expect(await store.listGroups()).toEqual([
      {
        chatId: -1001,
        title: "Old Room",
        username: null,
        type: "supergroup",
        status: "active",
      },
    ])
  })

  test("selects a group and opens a grouped settings hub", async () => {
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
    expect(settingsCall[0]).toContain("Build Room")
    expect(settingsCall[0]).toContain("Reply behavior: humans")
    expect(settingsCall[0]).toContain("Custom triggers: none")
    expect(
      settingsCall[1].reply_markup.inline_keyboard.flat().map((button) => button.text),
    ).toEqual([
      "Who the bot answers",
      "What triggers replies",
      "Custom trigger phrases",
      "Temporary memory",
      "Clear temporary memory",
    ])
  })

  test("updates reply policy through a reply behavior submenu", async () => {
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
    const replyBehaviorButton = reply.mock.calls
      .at(-1)[1]
      .reply_markup.inline_keyboard.flat()
      .find((button) => button.text === "Who the bot answers")
    await menu.handleCallback({
      from: { id: 123 },
      match: [
        replyBehaviorButton.callback_data,
        replyBehaviorButton.callback_data.replace("group:", ""),
      ],
      answerCallbackQuery: vi.fn(async () => undefined),
      reply,
    })
    expect(reply.mock.calls.at(-1)[0]).toContain("Who should the bot answer")
    const replyAllButton = reply.mock.calls
      .at(-1)[1]
      .reply_markup.inline_keyboard.flat()
      .find((button) => button.text === "Answer everyone")

    await menu.handleCallback({
      from: { id: 123 },
      match: [replyAllButton.callback_data, replyAllButton.callback_data.replace("group:", "")],
      answerCallbackQuery: vi.fn(async () => undefined),
      reply,
    })

    expect((await store.getSettings(-1001)).replyPolicy).toBe("all")
    expect(reply.mock.calls.at(-1)[0]).toContain("Current: all")
  })

  test("updates trigger, memory, and context settings through grouped submenus", async () => {
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
    const hubButtons = reply.mock.calls.at(-1)[1].reply_markup.inline_keyboard.flat()

    const triggersButton = hubButtons.find(
      (candidate) => candidate.text === "What triggers replies",
    )
    await menu.handleCallback({
      from: { id: 123 },
      match: [triggersButton.callback_data, triggersButton.callback_data.replace("group:", "")],
      answerCallbackQuery: vi.fn(async () => undefined),
      reply,
    })
    const nameAnywhereButton = reply.mock.calls
      .at(-1)[1]
      .reply_markup.inline_keyboard.flat()
      .find((candidate) => candidate.text === "Enable name anywhere")
    await menu.handleCallback({
      from: { id: 123 },
      match: [
        nameAnywhereButton.callback_data,
        nameAnywhereButton.callback_data.replace("group:", ""),
      ],
      answerCallbackQuery: vi.fn(async () => undefined),
      reply,
    })

    const backButton = reply.mock.calls
      .at(-1)[1]
      .reply_markup.inline_keyboard.flat()
      .find((candidate) => candidate.text === "Back")
    await menu.handleCallback({
      from: { id: 123 },
      match: [backButton.callback_data, backButton.callback_data.replace("group:", "")],
      answerCallbackQuery: vi.fn(async () => undefined),
      reply,
    })
    const memoryButton = reply.mock.calls
      .at(-1)[1]
      .reply_markup.inline_keyboard.flat()
      .find((candidate) => candidate.text === "Temporary memory")
    await menu.handleCallback({
      from: { id: 123 },
      match: [memoryButton.callback_data, memoryButton.callback_data.replace("group:", "")],
      answerCallbackQuery: vi.fn(async () => undefined),
      reply,
    })
    const memoryMenuButtons = reply.mock.calls.at(-1)[1].reply_markup.inline_keyboard.flat()
    for (const label of ["Disable memory", "Keep last 50 messages"]) {
      const button = memoryMenuButtons.find((candidate) => candidate.text === label)
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

  test("stays in the active submenu after updating trigger and memory settings", async () => {
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

    const triggersButton = reply.mock.calls
      .at(-1)[1]
      .reply_markup.inline_keyboard.flat()
      .find((candidate) => candidate.text === "What triggers replies")
    await menu.handleCallback({
      from: { id: 123 },
      match: [triggersButton.callback_data, triggersButton.callback_data.replace("group:", "")],
      answerCallbackQuery: vi.fn(async () => undefined),
      reply,
    })
    const mentionButton = reply.mock.calls
      .at(-1)[1]
      .reply_markup.inline_keyboard.flat()
      .find((candidate) => candidate.text === "Disable @mention")
    await menu.handleCallback({
      from: { id: 123 },
      match: [mentionButton.callback_data, mentionButton.callback_data.replace("group:", "")],
      answerCallbackQuery: vi.fn(async () => undefined),
      reply,
    })
    expect(reply.mock.calls.at(-1)[0]).toContain("triggers")
    expect(
      reply.mock.calls
        .at(-1)[1]
        .reply_markup.inline_keyboard.flat()
        .map((button) => button.text),
    ).toContain("Enable @mention")

    const backButton = reply.mock.calls
      .at(-1)[1]
      .reply_markup.inline_keyboard.flat()
      .find((candidate) => candidate.text === "Back")
    await menu.handleCallback({
      from: { id: 123 },
      match: [backButton.callback_data, backButton.callback_data.replace("group:", "")],
      answerCallbackQuery: vi.fn(async () => undefined),
      reply,
    })
    const memoryButton = reply.mock.calls
      .at(-1)[1]
      .reply_markup.inline_keyboard.flat()
      .find((candidate) => candidate.text === "Temporary memory")
    await menu.handleCallback({
      from: { id: 123 },
      match: [memoryButton.callback_data, memoryButton.callback_data.replace("group:", "")],
      answerCallbackQuery: vi.fn(async () => undefined),
      reply,
    })
    const messagesButton = reply.mock.calls
      .at(-1)[1]
      .reply_markup.inline_keyboard.flat()
      .find((candidate) => candidate.text === "Keep last 50 messages")
    await menu.handleCallback({
      from: { id: 123 },
      match: [messagesButton.callback_data, messagesButton.callback_data.replace("group:", "")],
      answerCallbackQuery: vi.fn(async () => undefined),
      reply,
    })
    expect(reply.mock.calls.at(-1)[0]).toContain("memory and context")
    expect(reply.mock.calls.at(-1)[0]).toContain("50 messages")
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

    const customTriggersButton = reply.mock.calls
      .at(-1)[1]
      .reply_markup.inline_keyboard.flat()
      .find((button) => button.text === "Custom trigger phrases")
    await menu.handleCallback({
      from: { id: 123 },
      match: [
        customTriggersButton.callback_data,
        customTriggersButton.callback_data.replace("group:", ""),
      ],
      answerCallbackQuery: vi.fn(async () => undefined),
      reply,
    })
    const addButton = reply.mock.calls
      .at(-1)[1]
      .reply_markup.inline_keyboard.flat()
      .find((button) => button.text === "Add trigger phrase")
    await menu.handleCallback({
      from: { id: 123 },
      match: [addButton.callback_data, addButton.callback_data.replace("group:", "")],
      answerCallbackQuery: vi.fn(async () => undefined),
      reply,
    })
    expect(reply.mock.calls.at(-1)[0]).toContain("Add custom trigger")

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
      .find((button) => button.text === "Remove trigger phrase")
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
    const customAgain = reply.mock.calls
      .at(-1)[1]
      .reply_markup.inline_keyboard.flat()
      .find((button) => button.text === "Custom trigger phrases")
    await menu.handleCallback({
      from: { id: 123 },
      match: [customAgain.callback_data, customAgain.callback_data.replace("group:", "")],
      answerCallbackQuery: vi.fn(async () => undefined),
      reply,
    })
    const clearButton = reply.mock.calls
      .at(-1)[1]
      .reply_markup.inline_keyboard.flat()
      .find((button) => button.text === "Remove all trigger phrases")
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
    const customTriggersButton = reply.mock.calls
      .at(-1)[1]
      .reply_markup.inline_keyboard.flat()
      .find((button) => button.text === "Custom trigger phrases")
    await menu.handleCallback({
      from: { id: 123 },
      match: [
        customTriggersButton.callback_data,
        customTriggersButton.callback_data.replace("group:", ""),
      ],
      answerCallbackQuery: vi.fn(async () => undefined),
      reply,
    })
    const addButton = reply.mock.calls
      .at(-1)[1]
      .reply_markup.inline_keyboard.flat()
      .find((button) => button.text === "Add trigger phrase")
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
