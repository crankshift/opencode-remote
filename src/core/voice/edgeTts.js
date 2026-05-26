import { mkdir, writeFile } from "node:fs/promises"
import { dirname } from "node:path"

export async function listEdgeTtsVoices({
  locale,
  gender,
  page = 1,
  pageSize = 20,
  listVoices = defaultListVoices,
} = {}) {
  const allVoices = await listVoices()
  const matchesRequestedLocale = createLocaleMatcher(allVoices, locale)
  const voices = allVoices.filter((voice) => {
    return matchesRequestedLocale(voice) && matchesGender(voice, gender)
  })
  const safePageSize = Math.max(1, Number(pageSize) || 20)
  const total = voices.length
  const totalPages = Math.max(1, Math.ceil(total / safePageSize))
  const safePage = Math.min(Math.max(1, Number(page) || 1), totalPages)
  const start = (safePage - 1) * safePageSize

  return {
    voices: voices.slice(start, start + safePageSize),
    page: safePage,
    pageSize: safePageSize,
    total,
    totalPages,
  }
}

export async function findEdgeTtsVoice(shortName, { listVoices = defaultListVoices } = {}) {
  const wanted = String(shortName ?? "").toLocaleLowerCase("en-US")
  const voices = await listVoices()
  return voices.find((voice) => voice.ShortName?.toLocaleLowerCase("en-US") === wanted) ?? null
}

export async function synthesizeEdgeTtsToMp3({
  text,
  voice,
  outputPath,
  synthesize = defaultSynthesize,
} = {}) {
  await synthesize({ text, voice, outputPath })
  return { outputPath }
}

async function defaultListVoices() {
  const edgeTts = await import("edge-tts-universal")
  const listVoices =
    edgeTts.listVoicesUniversal ?? edgeTts.listVoicesIsomorphic ?? edgeTts.listVoices
  if (typeof listVoices !== "function") {
    throw new Error("Edge TTS voice listing is not available")
  }
  return listVoices()
}

async function defaultSynthesize({ text, voice, outputPath }) {
  const edgeTts = await import("edge-tts-universal")
  const Communicate = edgeTts.IsomorphicCommunicate ?? edgeTts.Communicate
  if (typeof Communicate !== "function") {
    throw new Error("Edge TTS synthesis is not available")
  }

  const communicate = new Communicate(text, { voice })
  const chunks = []
  for await (const chunk of communicate.stream()) {
    if (chunk?.type === "audio" && chunk.data) {
      chunks.push(Buffer.from(chunk.data))
    }
  }
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, Buffer.concat(chunks))
}

function createLocaleMatcher(voices, locale) {
  const requested = String(locale ?? "")
    .trim()
    .toLocaleLowerCase("en-US")
  if (!requested) {
    return () => true
  }
  if (requested.includes("-")) {
    return (voice) => normalizeLocale(voice.Locale) === requested
  }

  const regionExists =
    requested.length === 2 && voices.some((voice) => localeRegion(voice.Locale) === requested)
  if (regionExists) {
    return (voice) => localeRegion(voice.Locale) === requested
  }

  return (voice) => {
    const voiceLocale = normalizeLocale(voice.Locale)
    const language = String(voice.Language ?? "").toLocaleLowerCase("en-US")
    return language === requested || voiceLocale.startsWith(`${requested}-`)
  }
}

function normalizeLocale(locale) {
  return String(locale ?? "").toLocaleLowerCase("en-US")
}

function localeRegion(locale) {
  const region = normalizeLocale(locale).split("-").at(-1) ?? ""
  return /^[a-z]{2}$/u.test(region) ? region : ""
}

function matchesGender(voice, gender) {
  const requested = String(gender ?? "")
    .trim()
    .toLocaleLowerCase("en-US")
  if (!requested) {
    return true
  }
  return String(voice.Gender ?? "").toLocaleLowerCase("en-US") === requested
}
