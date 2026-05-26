import { createReadStream as defaultCreateReadStream } from "node:fs"

export async function transcribeWithGroq({
  filePath,
  apiKey,
  model = "whisper-large-v3-turbo",
  client,
  createReadStream = defaultCreateReadStream,
} = {}) {
  if (!apiKey) {
    throw new Error("Groq API key is required for voice transcription.")
  }

  const groq = client ?? (await createGroqClient(apiKey))
  const response = await groq.audio.transcriptions.create({
    model,
    file: createReadStream(filePath),
  })
  return String(response?.text ?? "").trim()
}

async function createGroqClient(apiKey) {
  const { default: Groq } = await import("groq-sdk")
  return new Groq({ apiKey })
}
