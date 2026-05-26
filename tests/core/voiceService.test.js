import { describe, expect, test, vi } from "vitest"
import { createVoiceService } from "../../src/core/voice/voiceService.js"

const baseConfig = {
  enabled: true,
  mode: "on",
  voice: "en-US-AndrewNeural",
  groqApiKey: "gsk_test",
  sttModel: "whisper-large-v3-turbo",
}

describe("voiceService", () => {
  test("does not transcribe or speak when voice is disabled", async () => {
    const transcribe = vi.fn()
    const service = createVoiceService({
      config: { ...baseConfig, enabled: false, mode: "off" },
      transcribe,
    })

    expect(service.shouldSpeak({ source: "voice" })).toBe(false)
    await expect(service.transcribe("/voice.ogg")).rejects.toThrow(/Voice mode is disabled/u)
    expect(transcribe).not.toHaveBeenCalled()
  })

  test("speaks only for voice prompts in on mode", () => {
    const service = createVoiceService({ config: { ...baseConfig, mode: "on" } })

    expect(service.shouldSpeak({ source: "voice" })).toBe(true)
    expect(service.shouldSpeak({ source: "text" })).toBe(false)
  })

  test("speaks for every prompt in all mode", () => {
    const service = createVoiceService({ config: { ...baseConfig, mode: "all" } })

    expect(service.shouldSpeak({ source: "voice" })).toBe(true)
    expect(service.shouldSpeak({ source: "text" })).toBe(true)
  })

  test("transcribes with configured Groq model and API key", async () => {
    const transcribe = vi.fn(async () => "hello bot")
    const service = createVoiceService({ config: baseConfig, transcribe })

    await expect(service.transcribe("/voice.ogg")).resolves.toBe("hello bot")

    expect(transcribe).toHaveBeenCalledWith({
      filePath: "/voice.ogg",
      apiKey: "gsk_test",
      model: "whisper-large-v3-turbo",
    })
  })

  test("synthesizes a Telegram voice file through mp3 and ogg steps", async () => {
    const synthesizeMp3 = vi.fn(async ({ outputPath }) => ({ outputPath }))
    const convertToOgg = vi.fn(async ({ outputPath }) => ({ outputPath }))
    const service = createVoiceService({
      config: baseConfig,
      cacheDirectory: "/cache/voice",
      createId: () => "reply-1",
      assertFfmpeg: vi.fn(async () => ({ available: true })),
      synthesizeMp3,
      convertToOgg,
    })

    await expect(service.synthesizeTelegramVoice("hello reply")).resolves.toEqual({
      filePath: "/cache/voice/reply-1.ogg",
    })
    expect(synthesizeMp3).toHaveBeenCalledWith({
      text: "hello reply",
      voice: "en-US-AndrewNeural",
      outputPath: "/cache/voice/reply-1.mp3",
    })
    expect(convertToOgg).toHaveBeenCalledWith({
      inputPath: "/cache/voice/reply-1.mp3",
      outputPath: "/cache/voice/reply-1.ogg",
    })
  })

  test("persists mode changes", async () => {
    const saveConfig = vi.fn(async () => undefined)
    const service = createVoiceService({ config: baseConfig, saveConfig })

    await expect(service.setMode("all")).resolves.toEqual({ enabled: true, mode: "all" })
    await expect(service.setMode("off")).resolves.toEqual({ enabled: false, mode: "off" })
    expect(saveConfig).toHaveBeenNthCalledWith(1, { enabled: true, mode: "all" })
    expect(saveConfig).toHaveBeenNthCalledWith(2, { enabled: false, mode: "off" })
  })

  test("validates and persists selected voice", async () => {
    const voice = { ShortName: "uk-UA-OstapNeural", Locale: "uk-UA", Gender: "Male" }
    const findVoice = vi.fn(async () => voice)
    const saveConfig = vi.fn(async () => undefined)
    const service = createVoiceService({ config: baseConfig, findVoice, saveConfig })

    await expect(service.setVoice("uk-UA-OstapNeural")).resolves.toEqual(voice)
    expect(findVoice).toHaveBeenCalledWith("uk-UA-OstapNeural")
    expect(saveConfig).toHaveBeenCalledWith({ voice: "uk-UA-OstapNeural" })
  })

  test("reports status with ffmpeg availability and key presence", async () => {
    const service = createVoiceService({
      config: baseConfig,
      cacheDirectory: "/cache/voice",
      checkFfmpeg: vi.fn(async () => ({ available: true })),
    })

    await expect(service.status()).resolves.toEqual({
      enabled: true,
      mode: "on",
      voice: "en-US-AndrewNeural",
      sttModel: "whisper-large-v3-turbo",
      hasGroqApiKey: true,
      ffmpegAvailable: true,
      cacheDirectory: "/cache/voice",
    })
  })
})
