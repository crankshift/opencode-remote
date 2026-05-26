import { describe, expect, test, vi } from "vitest"
import { transcribeWithGroq } from "../../src/core/voice/groqTranscriber.js"

describe("groqTranscriber", () => {
  test("requires a Groq API key", async () => {
    await expect(transcribeWithGroq({ filePath: "/voice.ogg", apiKey: null })).rejects.toThrow(
      /Groq API key is required/u,
    )
  })

  test("sends audio to Groq Whisper and returns transcript text", async () => {
    const file = { stream: true }
    const createReadStream = vi.fn(() => file)
    const client = {
      audio: {
        transcriptions: {
          create: vi.fn(async () => ({ text: "transcribed voice prompt" })),
        },
      },
    }

    await expect(
      transcribeWithGroq({
        filePath: "/voice.ogg",
        apiKey: "gsk_test",
        model: "whisper-large-v3-turbo",
        client,
        createReadStream,
      }),
    ).resolves.toBe("transcribed voice prompt")

    expect(createReadStream).toHaveBeenCalledWith("/voice.ogg")
    expect(client.audio.transcriptions.create).toHaveBeenCalledWith({
      model: "whisper-large-v3-turbo",
      file,
    })
  })
})
