import { access, mkdir, rm } from "node:fs/promises"
import { posix, win32 } from "node:path"
import { getAppDataDir } from "../../core/state/appDataPath.js"

export const STICKER_CONVERTER_VERSION = "1"

export function getStickerCacheDir(options = {}) {
  const platform = options.platform ?? process.platform
  const pathApi = platform === "win32" ? win32 : posix
  return pathApi.join(getAppDataDir({ ...options, platform }), "cache", "stickers")
}

export function cachedStickerFilePath(sticker, options = {}) {
  const directory = options.directory ?? getStickerCacheDir(options)
  const platform = options.platform ?? process.platform
  const pathApi = platform === "win32" ? win32 : posix
  const fileUniqueId = sanitizeFilePart(sticker?.fileUniqueId ?? sticker?.file_unique_id)
  const kind = sanitizeFilePart(sticker?.kind ?? stickerKind(sticker))
  const extension = sanitizeExtension(sticker?.extension ?? "png")
  return pathApi.join(
    directory,
    `${fileUniqueId}-${kind}-v${STICKER_CONVERTER_VERSION}.${extension}`,
  )
}

export async function ensureStickerCacheDir(options = {}) {
  const directory = options.directory ?? getStickerCacheDir(options)
  await mkdir(directory, { recursive: true })
  return directory
}

export async function isStickerCacheRecordUsable({
  sticker,
  record,
  converterVersion = STICKER_CONVERTER_VERSION,
  accessFn = access,
} = {}) {
  if (!sticker || !record?.filePath) {
    return false
  }
  if (record.fileUniqueId !== sticker.file_unique_id) {
    return false
  }
  if (record.kind !== stickerKind(sticker)) {
    return false
  }
  if (
    Number(record.width) !== Number(sticker.width) ||
    Number(record.height) !== Number(sticker.height)
  ) {
    return false
  }
  if (sticker.file_size !== undefined && Number(record.fileSize) !== Number(sticker.file_size)) {
    return false
  }
  if (record.converterVersion !== converterVersion) {
    return false
  }

  try {
    await accessFn(record.filePath)
    return true
  } catch {
    return false
  }
}

export async function removeCachedStickerFiles(records = [], { logger, rmFn = rm } = {}) {
  for (const record of records) {
    const filePath = record?.filePath
    if (!filePath) {
      continue
    }

    try {
      await rmFn(filePath, { force: true })
    } catch (error) {
      logger?.warn?.({ error, filePath }, "Could not remove cached Telegram sticker file")
    }
  }
}

export function stickerKind(sticker) {
  if (sticker?.is_video) {
    return "video"
  }
  if (sticker?.is_animated) {
    return "animated"
  }
  return "static"
}

function sanitizeFilePart(value) {
  const safe = String(value ?? "sticker")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/\.{2,}/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
  return safe || "sticker"
}

function sanitizeExtension(value) {
  const safe = String(value ?? "png")
    .replace(/^\.+/u, "")
    .replace(/[^a-zA-Z0-9]+/g, "")
    .toLowerCase()
  return safe || "png"
}
