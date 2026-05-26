import { randomUUID } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { extname, join } from "node:path"
import { InputFile } from "grammy"

export async function downloadTelegramVoice({
  api,
  token,
  voice,
  directory = tmpdir(),
  fetchFn = fetch,
} = {}) {
  const file = await api.getFile(voice.file_id)
  if (!file?.file_path) {
    throw new Error("Telegram did not return a file path for the voice message")
  }

  const downloadUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`
  const response = await fetchFn(downloadUrl)
  if (!response.ok) {
    throw new Error(`Could not download Telegram voice message (${response.status})`)
  }

  const mime = voice.mime_type || mimeFromFilePath(file.file_path)
  const filePath = join(directory, `telegram-voice-${randomUUID()}${extensionForMime(mime)}`)
  const buffer = Buffer.from(await response.arrayBuffer())

  await mkdir(directory, { recursive: true })
  await writeFile(filePath, buffer)

  return { mime, filePath }
}

export async function sendTelegramVoice({
  ctx,
  filePath,
  inputFileFactory = (path) => new InputFile(path),
} = {}) {
  const voice = inputFileFactory(filePath)
  if (typeof ctx.replyWithVoice === "function") {
    return ctx.replyWithVoice(voice)
  }
  const chatId = ctx.chat?.id ?? ctx.message?.chat?.id
  return ctx.api.sendVoice(chatId, voice)
}

function mimeFromFilePath(filePath) {
  switch (extname(filePath).toLowerCase()) {
    case ".mp3":
      return "audio/mpeg"
    default:
      return "audio/ogg"
  }
}

function extensionForMime(mime) {
  switch (mime) {
    case "audio/mpeg":
      return ".mp3"
    default:
      return ".ogg"
  }
}
