import { randomUUID } from "node:crypto"
import { mkdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, extname, join } from "node:path"
import { pathToFileURL } from "node:url"
import {
  cachedStickerFilePath,
  isStickerCacheRecordUsable,
  STICKER_CONVERTER_VERSION,
  stickerKind,
} from "./stickerCache.js"
import {
  renderAnimatedStickerPreview as defaultRenderAnimatedStickerPreview,
  renderVideoStickerPreview as defaultRenderVideoStickerPreview,
} from "./stickerRenderer.js"

export async function downloadTelegramSticker({
  api,
  token,
  sticker,
  directory,
  destinationPath,
  fetchFn = fetch,
} = {}) {
  const file = await api.getFile(sticker.file_id)
  if (!file?.file_path) {
    throw new Error("Telegram did not return a file path for the sticker")
  }

  const downloadUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`
  const response = await fetchFn(downloadUrl)
  if (!response.ok) {
    throw new Error(`Could not download Telegram sticker (${response.status})`)
  }

  const mime = stickerMime(sticker, file.file_path)
  const filePath =
    destinationPath ?? join(directory, `telegram-sticker-${randomUUID()}${extensionForMime(mime)}`)
  const buffer = Buffer.from(await response.arrayBuffer())

  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, buffer)

  return {
    mime,
    url: pathToFileURL(filePath).href,
    filePath,
  }
}

export async function createStickerPrompt({
  api,
  token,
  sticker,
  store,
  cacheDirectory,
  mediaDirectory = tmpdir(),
  fetchFn = fetch,
  logger,
  renderVideoStickerPreview = defaultRenderVideoStickerPreview,
  renderAnimatedStickerPreview = defaultRenderAnimatedStickerPreview,
  describeStickerVisual = null,
} = {}) {
  const kind = stickerKind(sticker)
  const stickerMeta = stickerToStoreMetadata(sticker)
  await store?.upsertSeenSticker?.(stickerMeta)

  const cacheRecord = await store?.readCacheRecord?.(sticker.file_unique_id, kind)
  if (await isStickerCacheRecordUsable({ sticker, record: cacheRecord })) {
    const mime = kind === "static" ? "image/webp" : "image/png"
    return finalizeStickerPromptResult({
      sticker,
      attachment: attachmentFromFile(cacheRecord.filePath, mime),
      visualDescription: kind === "static" ? "static WebP image" : "cached preview",
      cleanupFiles: [],
      store,
      describeStickerVisual,
      logger,
    })
  }

  const extension = kind === "static" ? "webp" : "png"
  const outputPath = cachedStickerFilePath(
    { fileUniqueId: sticker.file_unique_id, kind, extension },
    { directory: cacheDirectory },
  )

  if (kind === "static") {
    const attachment = await downloadTelegramSticker({
      api,
      token,
      sticker,
      destinationPath: outputPath,
      fetchFn,
    })
    await writeStickerCacheRecord(store, sticker, outputPath, kind)
    return finalizeStickerPromptResult({
      sticker,
      attachment,
      visualDescription: "static WebP image",
      cleanupFiles: [],
      store,
      describeStickerVisual,
      logger,
    })
  }

  const downloaded = await downloadTelegramSticker({
    api,
    token,
    sticker,
    directory: mediaDirectory,
    fetchFn,
  })
  const cleanupFiles = [downloaded.filePath]

  try {
    await mkdir(dirname(outputPath), { recursive: true })
    const rendered =
      kind === "video"
        ? await renderVideoStickerPreview({ inputPath: downloaded.filePath, outputPath, sticker })
        : await renderAnimatedStickerPreview({
            inputPath: downloaded.filePath,
            outputPath,
            sticker,
          })
    const attachment = attachmentFromFile(
      rendered.filePath ?? outputPath,
      rendered.mime ?? "image/png",
    )
    await writeStickerCacheRecord(store, sticker, attachment.filePath, kind)
    return finalizeStickerPromptResult({
      sticker,
      attachment,
      visualDescription: `${kind} sticker sampled preview`,
      cleanupFiles,
      store,
      describeStickerVisual,
      logger,
    })
  } catch (error) {
    logger?.warn?.({ error, kind }, "Could not render Telegram sticker preview")
    return finalizeStickerPromptResult({
      sticker,
      attachment: downloaded,
      visualDescription: `${kind} sticker source file`,
      cleanupFiles,
      store,
      describeStickerVisual,
      logger,
    })
  }
}

export function formatStickerPromptText(sticker, visualDescription) {
  return [
    "React to this Telegram sticker as the Telegram bot persona.",
    "Use the attached visual sticker content and the metadata below.",
    "Do not describe the sticker in detail unless the user asks what is in it.",
    "Keep the reply short, funny, and chatty.",
    "",
    "Sticker metadata:",
    `- Sticker emoji: ${sticker.emoji ?? "unknown"}`,
    `- Sticker pack: ${sticker.set_name ?? "none"}`,
    `- Sticker type: ${stickerKind(sticker)}`,
    `- Sticker dimensions: ${Number(sticker.width ?? 0)}x${Number(sticker.height ?? 0)}`,
    `- Sticker visual: ${visualDescription}`,
  ].join("\n")
}

export function stickerToStoreMetadata(sticker) {
  return {
    fileUniqueId: sticker.file_unique_id,
    fileId: sticker.file_id,
    packName: sticker.set_name ?? null,
    emoji: sticker.emoji ?? null,
    kind: stickerKind(sticker),
    width: sticker.width ?? null,
    height: sticker.height ?? null,
    fileSize: sticker.file_size ?? null,
  }
}

async function writeStickerCacheRecord(store, sticker, filePath, kind) {
  await store?.writeCacheRecord?.({
    fileUniqueId: sticker.file_unique_id,
    packName: sticker.set_name ?? null,
    kind,
    width: sticker.width ?? null,
    height: sticker.height ?? null,
    fileSize: sticker.file_size ?? null,
    converterVersion: STICKER_CONVERTER_VERSION,
    filePath,
  })
}

function stickerPromptResult({ sticker, attachment, visualDescription, cleanupFiles }) {
  return {
    prompt: {
      text: formatStickerPromptText(sticker, visualDescription),
      attachments: [attachment],
    },
    packName: sticker.set_name ?? null,
    fileUniqueId: sticker.file_unique_id,
    cleanupFiles,
  }
}

async function finalizeStickerPromptResult({
  sticker,
  attachment,
  visualDescription,
  cleanupFiles,
  store,
  describeStickerVisual,
  logger,
}) {
  await maybeStoreStickerDescription({
    sticker,
    attachment,
    visualDescription,
    store,
    describeStickerVisual,
    logger,
  })
  return stickerPromptResult({ sticker, attachment, visualDescription, cleanupFiles })
}

async function maybeStoreStickerDescription({
  sticker,
  attachment,
  visualDescription,
  store,
  describeStickerVisual,
  logger,
}) {
  if (
    typeof describeStickerVisual !== "function" ||
    typeof store?.updateStickerDescription !== "function"
  ) {
    return
  }
  const existingSticker = await store?.getSeenSticker?.(sticker.file_unique_id)
  if (existingSticker?.description) {
    return
  }

  try {
    const description = sanitizeStickerDescription(
      await describeStickerVisual({ sticker, attachment, visualDescription }),
    )
    if (description) {
      await store.updateStickerDescription(sticker.file_unique_id, description)
    }
  } catch (error) {
    logger?.warn?.({ error }, "Could not describe Telegram sticker visual")
  }
}

function sanitizeStickerDescription(description) {
  const line = String(description ?? "")
    .split(/\r?\n/u)
    .map((part) => part.trim())
    .find(Boolean)
  if (!line) {
    return null
  }
  const safe = line
    .replace(/\[[^\]\n]*\]/gu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 160)
  return safe || null
}

function attachmentFromFile(filePath, mime) {
  return { mime, url: pathToFileURL(filePath).href, filePath }
}

function stickerMime(sticker, filePath) {
  if (sticker?.is_video) {
    return "video/webm"
  }
  if (sticker?.is_animated) {
    return "application/gzip"
  }
  switch (extname(filePath).toLowerCase()) {
    case ".png":
      return "image/png"
    case ".jpg":
    case ".jpeg":
      return "image/jpeg"
    default:
      return "image/webp"
  }
}

function extensionForMime(mime) {
  switch (mime) {
    case "video/webm":
      return ".webm"
    case "application/gzip":
      return ".tgs"
    case "image/png":
      return ".png"
    case "image/jpeg":
      return ".jpg"
    default:
      return ".webp"
  }
}
