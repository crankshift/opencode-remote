import { describe, expect, test, vi } from "vitest"
import {
  findEdgeTtsVoice,
  listEdgeTtsVoices,
  synthesizeEdgeTtsToMp3,
} from "../../src/core/voice/edgeTts.js"

const sampleVoices = [
  {
    ShortName: "en-US-AndrewNeural",
    Locale: "en-US",
    Language: "en",
    Gender: "Male",
    FriendlyName: "Microsoft Andrew Online - English (United States)",
  },
  {
    ShortName: "en-US-AvaNeural",
    Locale: "en-US",
    Language: "en",
    Gender: "Female",
    FriendlyName: "Microsoft Ava Online - English (United States)",
  },
  {
    ShortName: "uk-UA-OstapNeural",
    Locale: "uk-UA",
    Language: "uk",
    Gender: "Male",
    FriendlyName: "Microsoft Ostap Online - Ukrainian (Ukraine)",
  },
]

describe("edgeTts", () => {
  test("lists voices filtered by language and gender", async () => {
    const result = await listEdgeTtsVoices({
      locale: "en",
      gender: "male",
      listVoices: async () => sampleVoices,
    })

    expect(result).toEqual({
      voices: [sampleVoices[0]],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    })
  })

  test("paginates long voice lists", async () => {
    const voices = Array.from({ length: 25 }, (_, index) => ({
      ShortName: `en-US-Test${index}Neural`,
      Locale: "en-US",
      Language: "en",
      Gender: index % 2 === 0 ? "Male" : "Female",
      FriendlyName: `Test ${index}`,
    }))

    const result = await listEdgeTtsVoices({
      locale: "en-US",
      page: 2,
      pageSize: 10,
      listVoices: async () => voices,
    })

    expect(result.voices.map((voice) => voice.ShortName)).toEqual(
      voices.slice(10, 20).map((voice) => voice.ShortName),
    )
    expect(result.total).toBe(25)
    expect(result.totalPages).toBe(3)
  })

  test("finds a voice by short name", async () => {
    await expect(
      findEdgeTtsVoice("uk-UA-OstapNeural", { listVoices: async () => sampleVoices }),
    ).resolves.toBe(sampleVoices[2])
  })

  test("returns null when voice short name does not exist", async () => {
    await expect(
      findEdgeTtsVoice("en-US-MissingNeural", { listVoices: async () => sampleVoices }),
    ).resolves.toBeNull()
  })

  test("synthesizes speech to an mp3 path", async () => {
    const synthesize = vi.fn(async () => undefined)

    await expect(
      synthesizeEdgeTtsToMp3({
        text: "Hello from OpenCode Remote.",
        voice: "en-US-AndrewNeural",
        outputPath: "/cache/reply.mp3",
        synthesize,
      }),
    ).resolves.toEqual({ outputPath: "/cache/reply.mp3" })

    expect(synthesize).toHaveBeenCalledWith({
      text: "Hello from OpenCode Remote.",
      voice: "en-US-AndrewNeural",
      outputPath: "/cache/reply.mp3",
    })
  })
})
