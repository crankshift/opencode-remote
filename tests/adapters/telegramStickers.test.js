import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test, vi } from "vitest"
import { createMemoryStickerStore } from "../../src/adapters/telegram/stickerStore.js"
import {
  createStickerPrompt,
  downloadTelegramSticker,
  formatStickerPromptText,
} from "../../src/adapters/telegram/stickers.js"

describe("telegram sticker helpers", () => {
  test("downloads Telegram stickers without exposing the bot token in file URLs", async () => {
    const directory = await mkdtemp(join(tmpdir(), "telegram-sticker-download-"))
    const api = { getFile: vi.fn(async () => ({ file_path: "stickers/static.webp" })) }
    const fetchFn = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    }))

    try {
      const attachment = await downloadTelegramSticker({
        api,
        token: "secret-token",
        sticker: staticSticker(),
        directory,
        fetchFn,
      })

      expect(api.getFile).toHaveBeenCalledWith("file-static")
      expect(fetchFn).toHaveBeenCalledWith(
        "https://api.telegram.org/file/botsecret-token/stickers/static.webp",
      )
      expect(attachment.mime).toBe("image/webp")
      expect(attachment.url).toMatch(/^file:\/\//u)
      expect(attachment.url).not.toContain("secret-token")
      await expect(readFile(fileURLToPath(attachment.url))).resolves.toEqual(Buffer.from([1, 2, 3]))
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("creates a static sticker prompt with a cached WebP attachment and metadata text", async () => {
    const directory = await mkdtemp(join(tmpdir(), "telegram-static-sticker-"))
    const store = createMemoryStickerStore()
    const fetchFn = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new Uint8Array([4, 5, 6]).buffer,
    }))

    try {
      const result = await createStickerPrompt({
        api: { getFile: vi.fn(async () => ({ file_path: "stickers/static.webp" })) },
        token: "secret-token",
        sticker: staticSticker({ emoji: "😹", set_name: "funny_cats" }),
        store,
        cacheDirectory: directory,
        fetchFn,
      })

      expect(result.prompt.attachments).toEqual([
        expect.objectContaining({ mime: "image/webp", url: expect.stringMatching(/^file:/u) }),
      ])
      expect(result.prompt.text).toContain("Sticker emoji: 😹")
      expect(result.prompt.text).toContain("Sticker pack: funny_cats")
      expect(result.prompt.text).toContain("Sticker visual: static WebP image")
      expect(result.cleanupFiles).toEqual([])
      await expect(readFile(result.prompt.attachments[0].filePath)).resolves.toEqual(
        Buffer.from([4, 5, 6]),
      )
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("stores safe sticker descriptions generated from cached visual attachments", async () => {
    const directory = await mkdtemp(join(tmpdir(), "telegram-described-sticker-"))
    const store = createMemoryStickerStore()
    const describeStickerVisual = vi.fn(async ({ attachment, sticker, visualDescription }) => {
      expect(attachment).toEqual(
        expect.objectContaining({
          mime: "image/webp",
          filePath: expect.stringMatching(/unique-static/u),
        }),
      )
      expect(sticker.file_id).toBe("file-static")
      expect(visualDescription).toBe("static WebP image")
      return "laughing cat\n[telegram_sticker: 😹]"
    })

    try {
      await createStickerPrompt({
        api: { getFile: vi.fn(async () => ({ file_path: "stickers/static.webp" })) },
        token: "secret-token",
        sticker: staticSticker({ emoji: "😹", set_name: "funny_cats" }),
        store,
        cacheDirectory: directory,
        fetchFn: vi.fn(async () => ({
          ok: true,
          arrayBuffer: async () => new Uint8Array([4, 5, 6]).buffer,
        })),
        describeStickerVisual,
      })

      expect(describeStickerVisual).toHaveBeenCalledTimes(1)
      await expect(store.getSeenSticker("unique-static")).resolves.toEqual(
        expect.objectContaining({ description: "laughing cat" }),
      )
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("does not regenerate sticker descriptions when one already exists", async () => {
    const directory = await mkdtemp(join(tmpdir(), "telegram-described-sticker-existing-"))
    const store = createMemoryStickerStore()
    await store.upsertSeenSticker(stickerMetaFromTelegram(staticSticker()))
    await store.updateStickerDescription("unique-static", "existing cat")
    const describeStickerVisual = vi.fn(async () => "new cat")

    try {
      await createStickerPrompt({
        api: { getFile: vi.fn(async () => ({ file_path: "stickers/static.webp" })) },
        token: "secret-token",
        sticker: staticSticker(),
        store,
        cacheDirectory: directory,
        fetchFn: vi.fn(async () => ({
          ok: true,
          arrayBuffer: async () => new Uint8Array([4, 5, 6]).buffer,
        })),
        describeStickerVisual,
      })

      expect(describeStickerVisual).not.toHaveBeenCalled()
      await expect(store.getSeenSticker("unique-static")).resolves.toEqual(
        expect.objectContaining({ description: "existing cat" }),
      )
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("reuses usable cached sticker previews without downloading again", async () => {
    const directory = await mkdtemp(join(tmpdir(), "telegram-cached-sticker-"))
    const store = createMemoryStickerStore()
    const cachedPath = join(directory, "cached.webp")
    await writeFile(cachedPath, Buffer.from([9]))
    await store.writeCacheRecord({
      fileUniqueId: "unique-static",
      kind: "static",
      width: 512,
      height: 512,
      fileSize: 100,
      converterVersion: "1",
      filePath: cachedPath,
    })
    const fetchFn = vi.fn()

    try {
      const result = await createStickerPrompt({
        api: { getFile: vi.fn() },
        token: "secret-token",
        sticker: staticSticker({ file_size: 100 }),
        store,
        cacheDirectory: directory,
        fetchFn,
      })

      expect(fetchFn).not.toHaveBeenCalled()
      expect(result.prompt.attachments[0]).toEqual(
        expect.objectContaining({ mime: "image/webp", filePath: cachedPath }),
      )
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("regenerates video sticker previews when cache metadata no longer matches", async () => {
    const directory = await mkdtemp(join(tmpdir(), "telegram-video-sticker-"))
    const store = createMemoryStickerStore()
    const oldPath = join(directory, "old.png")
    await writeFile(oldPath, Buffer.from([1]))
    await store.writeCacheRecord({
      fileUniqueId: "unique-video",
      kind: "video",
      width: 128,
      height: 128,
      fileSize: 1,
      converterVersion: "1",
      filePath: oldPath,
    })
    const renderVideoStickerPreview = vi.fn(async ({ outputPath }) => {
      await writeFile(outputPath, Buffer.from([7, 8]))
      return { mime: "image/png", filePath: outputPath }
    })

    try {
      const result = await createStickerPrompt({
        api: { getFile: vi.fn(async () => ({ file_path: "stickers/video.webm" })) },
        token: "secret-token",
        sticker: videoSticker({ file_size: 200 }),
        store,
        cacheDirectory: directory,
        mediaDirectory: directory,
        fetchFn: vi.fn(async () => ({
          ok: true,
          arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
        })),
        renderVideoStickerPreview,
      })

      expect(renderVideoStickerPreview).toHaveBeenCalled()
      expect(result.prompt.attachments[0]).toEqual(
        expect.objectContaining({
          mime: "image/png",
          filePath: expect.stringMatching(/unique-video-video-v1\.png$/u),
        }),
      )
      await expect(store.readCacheRecord("unique-video", "video")).resolves.toEqual(
        expect.objectContaining({ fileSize: 200, filePath: result.prompt.attachments[0].filePath }),
      )
      expect(result.cleanupFiles).toHaveLength(1)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("uses a safe temporary download directory when cache paths use defaults", async () => {
    const store = createMemoryStickerStore()
    const renderVideoStickerPreview = vi.fn(async ({ inputPath, outputPath }) => {
      expect(inputPath).toMatch(/telegram-sticker-/u)
      return { mime: "image/png", filePath: outputPath }
    })
    let cleanupFiles = []

    try {
      const result = await createStickerPrompt({
        api: { getFile: vi.fn(async () => ({ file_path: "stickers/video.webm" })) },
        token: "secret-token",
        sticker: videoSticker(),
        store,
        fetchFn: vi.fn(async () => ({
          ok: true,
          arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
        })),
        renderVideoStickerPreview,
      })
      cleanupFiles = result.cleanupFiles

      expect(result.prompt.attachments[0]).toEqual(
        expect.objectContaining({
          mime: "image/png",
          filePath: expect.stringMatching(/unique-video-video-v1\.png$/u),
        }),
      )
    } finally {
      await Promise.all(cleanupFiles.map((filePath) => rm(filePath, { force: true })))
    }
  })

  test("creates preview cache directories before rendering non-static stickers", async () => {
    const directory = await mkdtemp(join(tmpdir(), "telegram-missing-preview-dir-"))
    const cacheDirectory = join(directory, "missing", "stickers")
    const store = createMemoryStickerStore()
    const renderVideoStickerPreview = vi.fn(async ({ outputPath }) => {
      await writeFile(outputPath, Buffer.from([8, 9]))
      return { mime: "image/png", filePath: outputPath }
    })

    try {
      const result = await createStickerPrompt({
        api: { getFile: vi.fn(async () => ({ file_path: "stickers/video.webm" })) },
        token: "secret-token",
        sticker: videoSticker(),
        store,
        cacheDirectory,
        fetchFn: vi.fn(async () => ({
          ok: true,
          arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
        })),
        renderVideoStickerPreview,
      })

      await expect(readFile(result.prompt.attachments[0].filePath)).resolves.toEqual(
        Buffer.from([8, 9]),
      )
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("formats sticker prompt metadata without raw Telegram payloads", () => {
    expect(
      formatStickerPromptText(
        staticSticker({ emoji: "👍", set_name: "ok_pack" }),
        "cached preview",
      ),
    ).toBe(
      [
        "React to this Telegram sticker as the Telegram bot persona.",
        "Use the attached visual sticker content and the metadata below.",
        "Do not describe the sticker in detail unless the user asks what is in it.",
        "Keep the reply short, funny, and chatty.",
        "",
        "Sticker metadata:",
        "- Sticker emoji: 👍",
        "- Sticker pack: ok_pack",
        "- Sticker type: static",
        "- Sticker dimensions: 512x512",
        "- Sticker visual: cached preview",
      ].join("\n"),
    )
  })
})

function staticSticker(overrides = {}) {
  return {
    file_id: "file-static",
    file_unique_id: "unique-static",
    width: 512,
    height: 512,
    file_size: 100,
    emoji: "😹",
    set_name: "funny_cats",
    is_animated: false,
    is_video: false,
    ...overrides,
  }
}

function videoSticker(overrides = {}) {
  return {
    file_id: "file-video",
    file_unique_id: "unique-video",
    width: 512,
    height: 512,
    file_size: 200,
    emoji: "🎬",
    set_name: "video_pack",
    is_animated: false,
    is_video: true,
    ...overrides,
  }
}

function stickerMetaFromTelegram(sticker) {
  return {
    fileUniqueId: sticker.file_unique_id,
    fileId: sticker.file_id,
    packName: sticker.set_name,
    emoji: sticker.emoji,
    kind: "static",
    width: sticker.width,
    height: sticker.height,
    fileSize: sticker.file_size,
  }
}
