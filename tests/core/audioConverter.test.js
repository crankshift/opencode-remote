import { describe, expect, test, vi } from "vitest"
import {
  assertFfmpegAvailable,
  checkFfmpeg,
  convertMp3ToTelegramOgg,
} from "../../src/core/voice/audioConverter.js"

describe("audioConverter", () => {
  test("reports ffmpeg as available", async () => {
    const execa = vi.fn(async () => undefined)

    await expect(checkFfmpeg({ execa })).resolves.toEqual({ available: true })

    expect(execa).toHaveBeenCalledWith("ffmpeg", ["-version"])
  })

  test("reports ffmpeg as missing with install guidance", async () => {
    const execa = vi.fn(async () => {
      throw new Error("ENOENT")
    })

    const result = await checkFfmpeg({ execa })

    expect(result.available).toBe(false)
    expect(result.message).toContain("Voice mode requires ffmpeg")
    expect(result.message).toContain("brew install ffmpeg")
    await expect(assertFfmpegAvailable({ execa })).rejects.toThrow(/Voice mode requires ffmpeg/u)
  })

  test("converts mp3 to Telegram voice-compatible OGG Opus", async () => {
    const execa = vi.fn(async () => undefined)

    await expect(
      convertMp3ToTelegramOgg({
        inputPath: "/cache/reply.mp3",
        outputPath: "/cache/reply.ogg",
        execa,
      }),
    ).resolves.toEqual({ outputPath: "/cache/reply.ogg" })

    expect(execa).toHaveBeenCalledWith("ffmpeg", [
      "-y",
      "-i",
      "/cache/reply.mp3",
      "-ac",
      "1",
      "-c:a",
      "libopus",
      "-b:a",
      "32k",
      "-f",
      "ogg",
      "/cache/reply.ogg",
    ])
  })
})
