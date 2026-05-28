import { describe, expect, test, vi } from "vitest"
import {
  renderAnimatedStickerPreview,
  renderVideoStickerPreview,
} from "../../src/adapters/telegram/stickerRenderer.js"

describe("telegram sticker renderer", () => {
  test("renders video stickers with ffmpeg contact-sheet settings", async () => {
    const execa = vi.fn(async () => undefined)

    await expect(
      renderVideoStickerPreview({ inputPath: "/tmp/in.webm", outputPath: "/tmp/out.png", execa }),
    ).resolves.toEqual({ mime: "image/png", filePath: "/tmp/out.png" })

    expect(execa).toHaveBeenCalledWith("ffmpeg", [
      "-y",
      "-i",
      "/tmp/in.webm",
      "-vf",
      "fps=2,scale=256:-1,tile=3x2",
      "-frames:v",
      "1",
      "/tmp/out.png",
    ])
  })

  test("renders animated TGS stickers through python-lottie when available", async () => {
    const execa = vi.fn(async () => undefined)

    await expect(
      renderAnimatedStickerPreview({ inputPath: "/tmp/in.tgs", outputPath: "/tmp/out.png", execa }),
    ).resolves.toEqual({ mime: "image/png", filePath: "/tmp/out.png" })

    expect(execa).toHaveBeenCalledWith("lottie_convert.py", ["/tmp/in.tgs", "/tmp/out.png"])
  })
})
