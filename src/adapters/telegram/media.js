import { randomUUID } from "node:crypto"
import { mkdir, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { extname, join } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

export const DEFAULT_IMAGE_PROMPT = "Please describe these images."

export function selectLargestPhoto(photoSizes = []) {
  if (!Array.isArray(photoSizes) || photoSizes.length === 0) {
    return null
  }

  return photoSizes.reduce((largest, photo) => {
    if (photoScore(photo) > photoScore(largest)) {
      return photo
    }
    return largest
  })
}

export function captionFromMessages(messages = []) {
  const captions = messages.map((message) => String(message?.caption ?? "").trim()).filter(Boolean)

  return captions.length > 0 ? captions.join("\n") : DEFAULT_IMAGE_PROMPT
}

export async function downloadTelegramPhoto({
  api,
  token,
  photo,
  directory = tmpdir(),
  fetchFn = fetch,
}) {
  const file = await api.getFile(photo.file_id)
  if (!file?.file_path) {
    throw new Error("Telegram did not return a file path for the photo")
  }

  const downloadUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`
  const response = await fetchFn(downloadUrl)
  if (!response.ok) {
    throw new Error(`Could not download Telegram photo (${response.status})`)
  }

  const mime = mimeFromFilePath(file.file_path)
  const filePath = join(directory, `telegram-photo-${randomUUID()}${extensionForMime(mime)}`)
  const buffer = Buffer.from(await response.arrayBuffer())

  await mkdir(directory, { recursive: true })
  await writeFile(filePath, buffer)

  return {
    mime,
    url: pathToFileURL(filePath).href,
    filePath,
  }
}

export async function cleanupAttachments(attachments = [], logger) {
  for (const attachment of attachments) {
    const filePath = attachmentFilePath(attachment)
    if (!filePath) {
      continue
    }

    try {
      await rm(filePath, { force: true })
    } catch (error) {
      logger?.warn?.({ error, filePath }, "Could not clean up Telegram media file")
    }
  }
}

function photoScore(photo) {
  if (Number.isFinite(photo?.file_size)) {
    return photo.file_size
  }
  return Number(photo?.width ?? 0) * Number(photo?.height ?? 0)
}

function mimeFromFilePath(filePath) {
  switch (extname(filePath).toLowerCase()) {
    case ".png":
      return "image/png"
    case ".webp":
      return "image/webp"
    case ".gif":
      return "image/gif"
    default:
      return "image/jpeg"
  }
}

function extensionForMime(mime) {
  switch (mime) {
    case "image/png":
      return ".png"
    case "image/webp":
      return ".webp"
    case "image/gif":
      return ".gif"
    default:
      return ".jpg"
  }
}

function attachmentFilePath(attachment) {
  if (attachment?.filePath) {
    return attachment.filePath
  }
  if (typeof attachment?.url === "string" && attachment.url.startsWith("file:")) {
    return fileURLToPath(attachment.url)
  }
  return null
}
