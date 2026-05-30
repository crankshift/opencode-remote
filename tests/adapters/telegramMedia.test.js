import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test, vi } from "vitest"
import {
  captionFromMessages,
  cleanupAttachments,
  downloadTelegramPhoto,
  selectLargestPhoto,
} from "../../src/adapters/telegram/media.js"

describe("telegram media helpers", () => {
  test("selects the largest Telegram photo size", () => {
    const largest = { file_id: "large", width: 1280, height: 720, file_size: 3000 }

    expect(
      selectLargestPhoto([
        { file_id: "small", width: 320, height: 180, file_size: 1000 },
        largest,
        { file_id: "medium", width: 640, height: 360, file_size: 2000 },
      ]),
    ).toBe(largest)
  })

  test("uses album captions as the prompt text", () => {
    expect(
      captionFromMessages([
        { caption: "" },
        { caption: "Compare these screenshots" },
        { caption: "and explain the error" },
      ]),
    ).toBe("Compare these screenshots\nand explain the error")
  })

  test("falls back to a funny reaction prompt when captions are empty", () => {
    expect(captionFromMessages([{ caption: "" }, {}])).toBe(
      [
        "React to this image as the Telegram bot persona.",
        "",
        "Do not describe the image in detail unless the user explicitly asks what is in it.",
        "Give a short, funny, chatty reaction to the main joke, mood, issue, or surprising detail.",
        "If it is a meme or news screenshot, respond to the point of it, not with OCR.",
        "Keep it under 3 short sentences.",
      ].join("\n"),
    )
  })

  test("downloads Telegram photos to local file URLs without exposing the bot token", async () => {
    const directory = await mkdtemp(join(tmpdir(), "telegram-media-test-"))
    const api = { getFile: vi.fn(async () => ({ file_path: "photos/file.jpg" })) }
    const fetchFn = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    }))
    const logger = { debug: vi.fn() }

    try {
      const attachment = await downloadTelegramPhoto({
        api,
        token: "secret-token",
        photo: { file_id: "file-1" },
        directory,
        fetchFn,
        logger,
      })

      expect(api.getFile).toHaveBeenCalledWith("file-1")
      expect(fetchFn).toHaveBeenCalledWith(
        "https://api.telegram.org/file/botsecret-token/photos/file.jpg",
      )
      expect(attachment.mime).toBe("image/jpeg")
      expect(attachment.url).toMatch(/^file:\/\//u)
      expect(attachment.url).not.toContain("secret-token")
      expect(logger.debug).toHaveBeenCalledWith(
        { fileSize: null, mime: "image/jpeg" },
        "Telegram photo downloaded",
      )
      expect(JSON.stringify(logger.debug.mock.calls)).not.toContain("secret-token")
      expect(JSON.stringify(logger.debug.mock.calls)).not.toContain(directory)
      await expect(readFile(fileURLToPath(attachment.url))).resolves.toEqual(Buffer.from([1, 2, 3]))
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("cleans up downloaded attachment files", async () => {
    const directory = await mkdtemp(join(tmpdir(), "telegram-media-cleanup-test-"))
    const attachment = await downloadTelegramPhoto({
      api: { getFile: vi.fn(async () => ({ file_path: "photos/file.png" })) },
      token: "secret-token",
      photo: { file_id: "file-1" },
      directory,
      fetchFn: vi.fn(async () => ({
        ok: true,
        arrayBuffer: async () => new Uint8Array([4, 5, 6]).buffer,
      })),
    })

    await cleanupAttachments([attachment], { warn: vi.fn() })

    await expect(readFile(fileURLToPath(attachment.url))).rejects.toThrow()
    await rm(directory, { recursive: true, force: true })
  })
})
