import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, test } from "vitest"
import {
  createMemoryStickerStore,
  openTelegramStickerStore,
} from "../../src/adapters/telegram/stickerStore.js"

describe("telegram sticker store", () => {
  const stores = []

  afterEach(() => {
    for (const store of stores.splice(0)) {
      store.close?.()
    }
  })

  test("persists saved packs and summarizes emojis", async () => {
    const { store, directory } = await openTempStore()

    try {
      await store.savePack({
        name: "funny_cats",
        stickers: [
          stickerMeta({ fileUniqueId: "cat-1", fileId: "file-cat-1", emoji: "😹" }),
          stickerMeta({ fileUniqueId: "cat-2", fileId: "file-cat-2", emoji: "😹" }),
          stickerMeta({ fileUniqueId: "cat-3", fileId: "file-cat-3", emoji: "👍" }),
        ],
      })

      expect(await store.listPacks()).toEqual([
        { name: "funny_cats", stickerCount: 3, emojis: ["😹", "👍"] },
      ])
      expect(await store.hasSavedPack("funny_cats")).toBe(true)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("selects a saved sticker by emoji with fallback to any saved sticker", async () => {
    const store = createMemoryStickerStore()
    stores.push(store)
    await store.savePack({
      name: "mixed",
      stickers: [
        stickerMeta({ fileUniqueId: "one", fileId: "file-one", emoji: "😹" }),
        stickerMeta({ fileUniqueId: "two", fileId: "file-two", emoji: "👍" }),
      ],
    })

    expect(await store.findStickerForEmoji("👍", { random: () => 0 })).toEqual(
      expect.objectContaining({ fileUniqueId: "two", fileId: "file-two", emoji: "👍" }),
    )
    expect(await store.findStickerForEmoji("🔥", { random: () => 0 })).toEqual(
      expect.objectContaining({ fileUniqueId: "one", fileId: "file-one", emoji: "😹" }),
    )
  })

  test("forgets packs and returns associated cache records", async () => {
    const store = createMemoryStickerStore()
    stores.push(store)
    await store.savePack({
      name: "mixed",
      stickers: [stickerMeta({ fileUniqueId: "one", fileId: "file-one" })],
    })
    await store.writeCacheRecord({
      fileUniqueId: "one",
      packName: "mixed",
      kind: "static",
      width: 512,
      height: 512,
      fileSize: 100,
      converterVersion: "1",
      filePath: "/cache/one.webp",
    })

    await expect(store.forgetPack("mixed")).resolves.toEqual({
      deleted: true,
      cacheRecords: [expect.objectContaining({ filePath: "/cache/one.webp" })],
    })
    expect(await store.listPacks()).toEqual([])
    await expect(store.forgetPack("missing")).resolves.toEqual({ deleted: false, cacheRecords: [] })
  })

  test("forgets SQLite cache rows tied by sticker ID even without a pack name", async () => {
    const { store, directory } = await openTempStore()

    try {
      await store.savePack({
        name: "mixed",
        stickers: [stickerMeta({ fileUniqueId: "one", fileId: "file-one", packName: "mixed" })],
      })
      await store.writeCacheRecord({
        fileUniqueId: "one",
        kind: "static",
        width: 512,
        height: 512,
        fileSize: 100,
        converterVersion: "1",
        filePath: "/cache/one.webp",
      })

      await expect(store.forgetPack("mixed")).resolves.toEqual({
        deleted: true,
        cacheRecords: [expect.objectContaining({ filePath: "/cache/one.webp" })],
      })
      await expect(store.readCacheRecord("one", "static")).resolves.toBeNull()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("stores seen stickers and cache records without secret fields", async () => {
    const store = createMemoryStickerStore()
    stores.push(store)
    await store.upsertSeenSticker(stickerMeta({ fileUniqueId: "seen-1", fileId: "file-seen" }))
    await store.writeCacheRecord({
      fileUniqueId: "seen-1",
      kind: "static",
      width: 512,
      height: 512,
      fileSize: 100,
      converterVersion: "1",
      filePath: "/cache/seen.webp",
    })

    const seen = await store.getSeenSticker("seen-1")
    const cache = await store.readCacheRecord("seen-1", "static")

    expect(seen).toEqual(expect.objectContaining({ fileUniqueId: "seen-1", fileId: "file-seen" }))
    expect(cache).toEqual(expect.objectContaining({ filePath: "/cache/seen.webp" }))
    expect(JSON.stringify({ seen, cache })).not.toContain("bot")
    expect(JSON.stringify({ seen, cache })).not.toContain("chat")
    expect(JSON.stringify({ seen, cache })).not.toContain("user")
  })
})

async function openTempStore() {
  const directory = await mkdtemp(join(tmpdir(), "sticker-store-test-"))
  const store = openTelegramStickerStore(join(directory, "stickers.db"))
  return { store, directory }
}

function stickerMeta(overrides = {}) {
  return {
    fileUniqueId: "unique-1",
    fileId: "file-1",
    packName: "pack",
    emoji: "😹",
    kind: "static",
    width: 512,
    height: 512,
    fileSize: 100,
    ...overrides,
  }
}
