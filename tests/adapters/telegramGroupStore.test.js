import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, test } from "vitest"
import {
  createMemoryGroupStore,
  DEFAULT_GROUP_CONFIG,
  openTelegramGroupStore,
} from "../../src/adapters/telegram/groupStore.js"

const tempDirs = []

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })))
  tempDirs.length = 0
})

describe("openTelegramGroupStore", () => {
  test("persists known groups and settings", async () => {
    const dbPath = await tempDbPath()
    const store = openTelegramGroupStore(dbPath)
    await store.upsertKnownGroup({
      chatId: -1001,
      title: "Build Room",
      username: "build_room",
      type: "supergroup",
      status: "active",
    })
    await store.updateSettings(-1001, {
      replyPolicy: "all",
      triggers: { nameAnywhere: true },
      context: { messages: 50 },
    })
    store.close()

    const reopened = openTelegramGroupStore(dbPath)
    expect(await reopened.listGroups()).toEqual([
      {
        chatId: -1001,
        title: "Build Room",
        username: "build_room",
        type: "supergroup",
        status: "active",
      },
    ])
    expect(await reopened.getSettings(-1001)).toEqual({
      ...DEFAULT_GROUP_CONFIG,
      replyPolicy: "all",
      triggers: { ...DEFAULT_GROUP_CONFIG.triggers, nameAnywhere: true },
      context: { ...DEFAULT_GROUP_CONFIG.context, messages: 50 },
    })
    reopened.close()
  })

  test("marks groups unavailable and resets settings", async () => {
    const store = openTelegramGroupStore(await tempDbPath())
    await store.upsertKnownGroup({ chatId: -1002, title: "Old Room", type: "group" })
    await store.updateSettings(-1002, { replyPolicy: "bots" })

    await store.markGroupUnavailable(-1002)
    await store.resetSettings(-1002)

    expect(await store.listGroups()).toEqual([
      {
        chatId: -1002,
        title: "Old Room",
        username: null,
        type: "group",
        status: "unavailable",
      },
    ])
    expect(await store.getSettings(-1002)).toEqual(DEFAULT_GROUP_CONFIG)
    store.close()
  })
})

describe("createMemoryGroupStore", () => {
  test("seeds known groups from allowed chat IDs", async () => {
    const store = createMemoryGroupStore({ allowedChatIds: [-1001, -1002] })

    expect(await store.listGroups()).toEqual([
      {
        chatId: -1001,
        title: "Group -1001",
        username: null,
        type: "supergroup",
        status: "configured",
      },
      {
        chatId: -1002,
        title: "Group -1002",
        username: null,
        type: "supergroup",
        status: "configured",
      },
    ])
  })
})

async function tempDbPath() {
  const dir = await mkdtemp(join(tmpdir(), "opencode-remote-group-store-"))
  tempDirs.push(dir)
  return join(dir, "groups.db")
}
