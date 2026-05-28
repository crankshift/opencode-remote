import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test, vi } from "vitest"
import { downloadTelegramVoice, sendTelegramVoice } from "../../src/adapters/telegram/voice.js"

describe("telegram voice helpers", () => {
  test("downloads Telegram voice files without exposing the bot token", async () => {
    const directory = await mkdtemp(join(tmpdir(), "telegram-voice-test-"))
    const api = { getFile: vi.fn(async () => ({ file_path: "voice/file_1.oga" })) }
    const fetchFn = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    }))

    try {
      const attachment = await downloadTelegramVoice({
        api,
        token: "secret-token",
        voice: { file_id: "voice-1", mime_type: "audio/ogg" },
        directory,
        fetchFn,
      })

      expect(api.getFile).toHaveBeenCalledWith("voice-1")
      expect(fetchFn).toHaveBeenCalledWith(
        "https://api.telegram.org/file/botsecret-token/voice/file_1.oga",
      )
      expect(attachment.mime).toBe("audio/ogg")
      expect(attachment.filePath).toMatch(/telegram-voice-.+\.ogg$/u)
      expect(attachment.filePath).not.toContain("secret-token")
      await expect(readFile(attachment.filePath)).resolves.toEqual(Buffer.from([1, 2, 3]))
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test("sends Telegram voice files as voice notes", async () => {
    const replyWithVoice = vi.fn(async () => ({ message_id: 10, chat: { id: 123 } }))
    const inputFileFactory = vi.fn((filePath) => ({ input: filePath }))

    await expect(
      sendTelegramVoice({
        ctx: { replyWithVoice },
        filePath: "/cache/reply.ogg",
        inputFileFactory,
      }),
    ).resolves.toEqual({ message_id: 10, chat: { id: 123 } })

    expect(inputFileFactory).toHaveBeenCalledWith("/cache/reply.ogg")
    expect(replyWithVoice).toHaveBeenCalledWith({ input: "/cache/reply.ogg" })
  })

  test("passes captions to ctx.replyWithVoice", async () => {
    const replyWithVoice = vi.fn(async () => ({ message_id: 1 }))
    const inputFileFactory = vi.fn((path) => ({ path }))

    await sendTelegramVoice({
      ctx: { replyWithVoice },
      filePath: "/cache/reply.ogg",
      caption: "answer",
      inputFileFactory,
    })

    expect(inputFileFactory).toHaveBeenCalledWith("/cache/reply.ogg")
    expect(replyWithVoice).toHaveBeenCalledWith({ path: "/cache/reply.ogg" }, { caption: "answer" })
  })
})
