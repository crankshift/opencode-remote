import { constants } from "node:fs"
import { lstat, open, realpath } from "node:fs/promises"
import { basename, extname, isAbsolute, join, relative, resolve } from "node:path"
import { InputFile } from "grammy"
import { getAppDataDir } from "../../core/state/appDataPath.js"

const GENERATED_MEDIA_MARKER = /^MEDIA:(.+)$/u

export function parseGeneratedMediaMarkers(text) {
  const mediaPaths = []
  const visibleLines = []

  for (const line of String(text ?? "").split("\n")) {
    const match = line.trim().match(GENERATED_MEDIA_MARKER)
    const mediaPath = match?.[1]?.trim()
    if (mediaPath && isAbsolute(mediaPath)) {
      mediaPaths.push(mediaPath)
      continue
    }
    visibleLines.push(line)
  }

  return {
    visibleText: visibleLines.join("\n").trim(),
    mediaPaths,
  }
}

export async function deliverGeneratedMedia({
  ctx,
  mediaPaths,
  logger,
  validateMediaPath,
  allowedDirectories = [getDefaultGeneratedMediaDirectory()],
} = {}) {
  let sent = 0
  let failed = 0
  const validate = validateMediaPath ?? validateGeneratedMediaPath

  for (const filePath of mediaPaths ?? []) {
    const validation = await validate(filePath, { allowedDirectories })
    if (!validation.valid) {
      failed += 1
      logger?.warn?.(validation.metadata, "Generated media file was not sendable")
      continue
    }

    try {
      await sendGeneratedPhoto(ctx, validation.media)
      sent += 1
      logger?.debug?.(
        { extension: validation.metadata.extension, size: validation.metadata.size },
        "Generated media file sent",
      )
    } catch (error) {
      failed += 1
      logger?.warn?.(
        {
          reason: "send_failed",
          extension: validation.metadata.extension,
          size: validation.metadata.size,
          errorName: error?.name,
          errorCode: error?.code,
        },
        "Could not send generated media file",
      )
    }
  }

  return { sent, failed }
}

export async function validateGeneratedMediaPath(
  filePath,
  {
    lstatFile = lstat,
    openFile = open,
    realpathFile = realpath,
    allowedDirectories = [getDefaultGeneratedMediaDirectory()],
  } = {},
) {
  if (!isAbsolute(String(filePath ?? ""))) {
    return { valid: false, metadata: { reason: "not_absolute" } }
  }

  const extension = extname(filePath).toLowerCase()

  let linkStat
  try {
    linkStat = await lstatFile(filePath)
  } catch (error) {
    return { valid: false, metadata: { reason: "not_found", extension, code: error?.code } }
  }
  if (linkStat.isSymbolicLink()) {
    return { valid: false, metadata: { reason: "symlink", extension } }
  }
  if (!linkStat.isFile()) {
    return { valid: false, metadata: { reason: "not_file", extension } }
  }

  const contained = await resolveContainedRealPath(filePath, allowedDirectories, realpathFile)
  if (!contained.allowed) {
    return { valid: false, metadata: { reason: "outside_allowed_directory", extension } }
  }
  const realFilePath = contained.realFilePath

  let file
  try {
    file = await openFile(realFilePath, openReadNoFollowFlags())
  } catch (error) {
    const reason =
      error?.code === "EACCES" || error?.code === "EPERM" ? "not_readable" : "open_failed"
    return { valid: false, metadata: { reason, extension, code: error?.code } }
  }

  let fileStat
  try {
    fileStat = await file.stat()
    if (!fileStat.isFile()) {
      return { valid: false, metadata: { reason: "not_file", extension } }
    }
    if (!sameFileIdentity(linkStat, fileStat)) {
      return { valid: false, metadata: { reason: "file_changed", extension } }
    }
    if (fileStat.size <= 0) {
      return { valid: false, metadata: { reason: "empty", extension } }
    }

    const content = await file.readFile()
    const detectedType = detectImageType(content)
    if (!detectedType) {
      return { valid: false, metadata: { reason: "unsupported_type", extension } }
    }

    return {
      valid: true,
      metadata: { extension, size: fileStat.size, type: detectedType },
      media: { content, filename: basename(realFilePath) },
    }
  } catch (error) {
    return { valid: false, metadata: { reason: "read_failed", extension, code: error?.code } }
  } finally {
    await file.close().catch(() => undefined)
  }
}

export function getDefaultGeneratedMediaDirectory(options = {}) {
  return join(getAppDataDir(options), "cache", "generated-media")
}

async function resolveContainedRealPath(filePath, allowedDirectories, realpathFile) {
  let resolvedFilePath
  try {
    resolvedFilePath = await realpathFile(filePath)
  } catch {
    return { allowed: false }
  }

  for (const directory of allowedDirectories ?? []) {
    let resolvedDirectory
    try {
      resolvedDirectory = await realpathFile(directory)
    } catch {
      continue
    }
    const relativePath = relative(resolve(resolvedDirectory), resolve(resolvedFilePath))
    if (
      relativePath === "" ||
      (relativePath && !relativePath.startsWith("..") && !isAbsolute(relativePath))
    ) {
      return { allowed: true, realFilePath: resolvedFilePath }
    }
  }
  return { allowed: false }
}

function sameFileIdentity(beforeOpen, afterOpen) {
  return beforeOpen.dev === afterOpen.dev && beforeOpen.ino === afterOpen.ino
}

function detectImageType(bytes) {
  if (isPng(bytes)) {
    return "png"
  }
  if (isJpeg(bytes)) {
    return "jpeg"
  }
  if (isWebp(bytes)) {
    return "webp"
  }
  return null
}

function openReadNoFollowFlags() {
  return constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)
}

function isPng(bytes) {
  return (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
}

function isJpeg(bytes) {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
}

function isWebp(bytes) {
  return (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  )
}

function sendGeneratedPhoto(ctx, media) {
  const photo = new InputFile(media.content, media.filename)
  if (typeof ctx?.replyWithPhoto === "function") {
    return ctx.replyWithPhoto(photo)
  }
  const chatId = ctx?.chat?.id ?? ctx?.message?.chat?.id
  if (typeof ctx?.api?.sendPhoto === "function") {
    return ctx.api.sendPhoto(chatId, photo)
  }
  throw new Error("Telegram photo send API is unavailable")
}
