import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test, vi } from "vitest"
import {
  cachedStickerFilePath,
  getStickerCacheDir,
  isStickerCacheRecordUsable,
  removeCachedStickerFiles,
  STICKER_CONVERTER_VERSION,
} from "../../src/adapters/telegram/stickerCache.js"

describe("telegram sticker cache helpers", () => {
  test("uses the app-data sticker cache directory", () => {
    expect(
      getStickerCacheDir({
        platform: "linux",
        env: { XDG_DATA_HOME: "/data" },
        homeDir: "/home/user",
      }),
    ).toBe("/data/opencode-remote/cache/stickers")
  })

  test("builds safe cached sticker file paths", () => {
    expect(
      cachedStickerFilePath(
        { fileUniqueId: "abc/../def", kind: "animated", extension: "png" },
        { directory: "/cache/stickers" },
      ),
    ).toBe(`/cache/stickers/abc-def-animated-v${STICKER_CONVERTER_VERSION}.png`)
  })

  test("accepts usable cache records when sticker metadata and file match", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sticker-cache-valid-"))
    const filePath = join(directory, "cached.png")
    await writeFile(filePath, Buffer.from([1, 2, 3]))

    try {
      await expect(
        isStickerCacheRecordUsable({
          sticker: staticSticker({ file_unique_id: "unique-1", file_size: 123 }),
          record: {
            fileUniqueId: "unique-1",
            kind: "static",
            width: 512,
            height: 512,
            fileSize: 123,
            converterVersion: STICKER_CONVERTER_VERSION,
            filePath,
          },
        }),
      ).resolves.toBe(true)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("rejects cache records when metadata differs or the file is missing", async () => {
    const sticker = staticSticker({ file_unique_id: "unique-1", file_size: 123 })

    await expect(
      isStickerCacheRecordUsable({
        sticker,
        record: {
          fileUniqueId: "unique-2",
          kind: "static",
          width: 512,
          height: 512,
          fileSize: 123,
          converterVersion: STICKER_CONVERTER_VERSION,
          filePath: "/missing.png",
        },
      }),
    ).resolves.toBe(false)

    await expect(
      isStickerCacheRecordUsable({
        sticker,
        record: {
          fileUniqueId: "unique-1",
          kind: "static",
          width: 512,
          height: 512,
          fileSize: 123,
          converterVersion: STICKER_CONVERTER_VERSION,
          filePath: "/missing.png",
        },
      }),
    ).resolves.toBe(false)
  })

  test("removes cached sticker files and logs cleanup failures", async () => {
    const rmFn = vi.fn(async (filePath) => {
      if (filePath === "/cache/bad.png") {
        throw new Error("locked")
      }
    })
    const logger = { warn: vi.fn() }

    await removeCachedStickerFiles(
      [{ filePath: "/cache/ok.png" }, { filePath: "/cache/bad.png" }, { filePath: null }],
      { logger, rmFn },
    )

    expect(rmFn).toHaveBeenCalledWith("/cache/ok.png", { force: true })
    expect(rmFn).toHaveBeenCalledWith("/cache/bad.png", { force: true })
    expect(logger.warn).toHaveBeenCalledWith(
      { error: expect.any(Error), filePath: "/cache/bad.png" },
      "Could not remove cached Telegram sticker file",
    )
  })
})

function staticSticker(overrides = {}) {
  return {
    file_id: "file-1",
    file_unique_id: "unique-1",
    width: 512,
    height: 512,
    is_animated: false,
    is_video: false,
    ...overrides,
  }
}
