import { describe, expect, test, vi } from "vitest"
import {
  assertFfmpegAvailable,
  checkFfmpeg,
  convertMp3ToTelegramOgg,
  detectFfmpegInstaller,
  installFfmpeg,
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

  test("detects the first available ffmpeg installer for the platform", async () => {
    const execa = vi.fn(async (command) => {
      if (command === "apt") {
        return undefined
      }
      throw new Error("missing command")
    })

    await expect(detectFfmpegInstaller({ platform: "linux", execa })).resolves.toEqual({
      command: "sudo",
      args: ["apt", "install", "ffmpeg"],
      displayCommand: "sudo apt install ffmpeg",
    })
    expect(execa).toHaveBeenCalledWith("apt", ["--version"])
  })

  test("returns null when no supported ffmpeg installer is available", async () => {
    const execa = vi.fn(async () => {
      throw new Error("missing command")
    })

    await expect(detectFfmpegInstaller({ platform: "linux", execa })).resolves.toBeNull()
  })

  test("runs the ffmpeg installer with inherited terminal IO", async () => {
    const execa = vi.fn(async () => undefined)
    const installer = {
      command: "brew",
      args: ["install", "ffmpeg"],
      displayCommand: "brew install ffmpeg",
    }

    await expect(installFfmpeg(installer, { execa })).resolves.toEqual({ ok: true })

    expect(execa).toHaveBeenCalledWith("brew", ["install", "ffmpeg"], { stdio: "inherit" })
  })

  test("reports ffmpeg installer failures without throwing", async () => {
    const error = new Error("install failed")
    const execa = vi.fn(async () => {
      throw error
    })

    await expect(
      installFfmpeg(
        {
          command: "sudo",
          args: ["apt", "install", "ffmpeg"],
          displayCommand: "sudo apt install ffmpeg",
        },
        { execa },
      ),
    ).resolves.toEqual({ ok: false, error })
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
