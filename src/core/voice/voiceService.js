import { randomUUID } from "node:crypto"
import { join } from "node:path"
import { assertFfmpegAvailable, checkFfmpeg, convertMp3ToTelegramOgg } from "./audioConverter.js"
import { getVoiceCacheDir } from "./cache.js"
import { findEdgeTtsVoice, listEdgeTtsVoices, synthesizeEdgeTtsToMp3 } from "./edgeTts.js"
import { transcribeWithGroq } from "./groqTranscriber.js"

const VOICE_MODES = ["off", "on", "all"]

export function createVoiceService({
  config,
  cacheDirectory = getVoiceCacheDir(),
  createId = randomUUID,
  transcribe = transcribeWithGroq,
  listVoices = listEdgeTtsVoices,
  findVoice = findEdgeTtsVoice,
  synthesizeMp3 = synthesizeEdgeTtsToMp3,
  convertToOgg = convertMp3ToTelegramOgg,
  checkFfmpeg: checkFfmpegDependency = checkFfmpeg,
  assertFfmpeg = assertFfmpegAvailable,
  saveConfig = async () => undefined,
} = {}) {
  let voiceConfig = normalizeVoiceConfig(config)

  return {
    async status() {
      const ffmpeg = await checkFfmpegDependency()
      return {
        enabled: voiceConfig.enabled,
        mode: voiceConfig.mode,
        captions: voiceConfig.captions,
        voice: voiceConfig.voice,
        sttModel: voiceConfig.sttModel,
        hasGroqApiKey: Boolean(voiceConfig.groqApiKey),
        ffmpegAvailable: Boolean(ffmpeg.available),
        cacheDirectory,
      }
    },

    isEnabled() {
      return voiceConfig.enabled && voiceConfig.mode !== "off"
    },

    shouldSpeak({ source } = {}) {
      if (!voiceConfig.enabled || voiceConfig.mode === "off") {
        return false
      }
      return voiceConfig.mode === "all" || source === "voice"
    },

    shouldCaption() {
      return voiceConfig.captions
    },

    async transcribe(filePath) {
      if (!voiceConfig.enabled || voiceConfig.mode === "off") {
        throw new Error("Voice mode is disabled.")
      }
      return transcribe({
        filePath,
        apiKey: voiceConfig.groqApiKey,
        model: voiceConfig.sttModel,
      })
    },

    async listVoices(filters = {}) {
      return listVoices(filters)
    },

    async setMode(mode) {
      if (!VOICE_MODES.includes(mode)) {
        throw new Error("Use /voice on|off|all.")
      }
      const next = { enabled: mode !== "off", mode }
      await saveConfig(next)
      voiceConfig = { ...voiceConfig, ...next }
      return next
    },

    async setCaptions(captions) {
      const next = { captions: Boolean(captions) }
      await saveConfig(next)
      voiceConfig = { ...voiceConfig, ...next }
      return next
    },

    async setVoice(shortName) {
      const voice = await findVoice(shortName)
      if (!voice) {
        throw new Error(`Voice not found: ${shortName}`)
      }
      await saveConfig({ voice: voice.ShortName })
      voiceConfig = { ...voiceConfig, voice: voice.ShortName }
      return voice
    },

    async synthesizeTelegramVoice(text) {
      await assertFfmpeg()
      const id = createId()
      const mp3Path = join(cacheDirectory, `${id}.mp3`)
      const oggPath = join(cacheDirectory, `${id}.ogg`)
      await synthesizeMp3({
        text,
        voice: voiceConfig.voice,
        outputPath: mp3Path,
      })
      const result = await convertToOgg({ inputPath: mp3Path, outputPath: oggPath })
      return { filePath: result.outputPath }
    },
  }
}

function normalizeVoiceConfig(config = {}) {
  return {
    enabled: Boolean(config.enabled),
    mode: VOICE_MODES.includes(config.mode) ? config.mode : "on",
    captions: Boolean(config.captions),
    voice: config.voice || "en-US-AndrewNeural",
    groqApiKey: config.groqApiKey || null,
    sttModel: config.sttModel || "whisper-large-v3-turbo",
  }
}
