import { createHash } from "node:crypto"
import { lstat, mkdir, readFile, realpath, stat } from "node:fs/promises"
import { posix, relative, resolve, win32 } from "node:path"
import sharp from "sharp"
import { getAppDataDir } from "../state/appDataPath.js"

const DEFAULT_WIDTH = 1024
const DEFAULT_HEIGHT = 768
const MIN_DIMENSION = 1
const MAX_DIMENSION = 4096
const TEXT_PADDING = 24
const DRAKE_TEMPLATE_IDS = new Set(["181913649"])
const DRAKE_TEMPLATE_ALIASES = ["drake hotline bling", "drakeposting", "drake"]

export function getGeneratedMediaCacheDir(options = {}) {
  const platform = options.platform ?? process.platform
  const pathApi = platform === "win32" ? win32 : posix
  return pathApi.join(getAppDataDir({ ...options, platform }), "cache", "generated-media")
}

export function normalizeRenderSpec(spec) {
  if (!spec || typeof spec !== "object") {
    throw new Error("Meme render spec must be an object")
  }

  const template = normalizeTemplate(spec.template)
  const texts = normalizeTexts(spec.texts ?? spec.text)
  if (texts.length === 0) {
    throw new Error("Meme render spec requires at least one non-empty text")
  }

  const width = normalizeDimension(spec.width, template.width ?? DEFAULT_WIDTH, "width")
  const height = normalizeDimension(spec.height, template.height ?? DEFAULT_HEIGHT, "height")
  const explicitBoxes = normalizeBoxes(spec.boxes, { width, height })

  return {
    template,
    width,
    height,
    texts,
    boxes:
      explicitBoxes.length > 0
        ? explicitBoxes
        : inferTemplateBoxes({ template, texts, width, height }),
  }
}

export async function renderMemeFromSpec({
  spec,
  outputDirectory = getGeneratedMediaCacheDir(),
  fetchImpl = globalThis.fetch,
  allowedTemplateDirectories = [],
} = {}) {
  const renderSpec = normalizeRenderSpec(spec)
  const absoluteOutputDirectory = resolve(outputDirectory)
  await mkdir(absoluteOutputDirectory, { recursive: true })

  const baseImage = await loadBaseImage({ renderSpec, fetchImpl, allowedTemplateDirectories })
  const svg = buildTextOverlay(renderSpec)
  const filePath = posixOrNativeJoin(absoluteOutputDirectory, `meme-${hashSpec(renderSpec)}.png`)

  await sharp(baseImage)
    .resize(renderSpec.width, renderSpec.height, { fit: "fill" })
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toFile(filePath)

  const outputStats = await stat(filePath)
  if (outputStats.size <= 0) {
    throw new Error("Rendered meme output is empty")
  }

  return { filePath, mediaMarker: `MEDIA:${filePath}` }
}

function normalizeTexts(value) {
  const values = Array.isArray(value) ? value : [value]
  return values
    .map((text) => (text == null ? "" : String(text).trim()))
    .filter((text) => text.length > 0)
}

function normalizeTemplate(template) {
  if (!template || typeof template !== "object") {
    return {}
  }

  return Object.fromEntries(
    [
      ["id", normalizeOptionalString(template.id)],
      ["name", normalizeOptionalString(template.name)],
      ["url", normalizeOptionalString(template.url)],
      ["imagePath", normalizeOptionalString(template.imagePath)],
      ["width", normalizeOptionalPositiveInteger(template.width)],
      ["height", normalizeOptionalPositiveInteger(template.height)],
      ["box_count", normalizeOptionalPositiveInteger(template.box_count ?? template.boxCount)],
    ].filter(([, value]) => value !== undefined),
  )
}

function normalizeOptionalString(value) {
  if (value == null) {
    return undefined
  }

  const normalized = String(value).trim()
  return normalized.length > 0 ? normalized : undefined
}

function normalizeDimension(value, fallback, fieldName) {
  const number = value == null ? fallback : Number(value)
  if (!Number.isFinite(number) || number < MIN_DIMENSION) {
    throw new Error(`Meme render spec ${fieldName} must be positive`)
  }

  return Math.min(MAX_DIMENSION, Math.max(MIN_DIMENSION, Math.round(number)))
}

function normalizeOptionalPositiveInteger(value) {
  if (value == null) {
    return undefined
  }

  const number = Number(value)
  if (!Number.isFinite(number) || number < MIN_DIMENSION) {
    return undefined
  }

  return Math.min(MAX_DIMENSION, Math.max(MIN_DIMENSION, Math.round(number)))
}

function normalizeBoxes(boxes, bounds) {
  if (!Array.isArray(boxes)) {
    return []
  }

  return boxes
    .map((box) => normalizeBox(box, bounds))
    .filter((box) => box.width > 0 && box.height > 0)
}

function normalizeBox(box, bounds) {
  const x = clampDimension(box?.x, 0, bounds.width)
  const y = clampDimension(box?.y, 0, bounds.height)
  const requestedWidth = clampDimension(box?.width, bounds.width - x, bounds.width)
  const requestedHeight = clampDimension(box?.height, bounds.height - y, bounds.height)

  return {
    x,
    y,
    width: Math.min(requestedWidth, bounds.width - x),
    height: Math.min(requestedHeight, bounds.height - y),
  }
}

function clampDimension(value, fallback, maximum) {
  const number = Number(value ?? fallback)
  if (!Number.isFinite(number)) {
    return fallback
  }

  return Math.min(maximum, Math.max(0, Math.round(number)))
}

async function loadBaseImage({ renderSpec, fetchImpl, allowedTemplateDirectories }) {
  if (renderSpec.template.imagePath) {
    return readFile(
      await resolveAllowedTemplateImagePath({
        imagePath: renderSpec.template.imagePath,
        allowedTemplateDirectories,
      }),
    )
  }

  if (renderSpec.template.url) {
    assertAllowedTemplateUrl(renderSpec.template.url)

    if (typeof fetchImpl !== "function") {
      throw new Error("A fetch implementation is required to load meme template URLs")
    }

    const response = await fetchImpl(renderSpec.template.url, { redirect: "error" })
    if (!response?.ok) {
      throw new Error(`Failed to fetch meme template image (${response?.status ?? "unknown"})`)
    }
    if (response.url) {
      assertAllowedTemplateUrl(response.url)
    }

    return Buffer.from(await response.arrayBuffer())
  }

  throw new Error(
    "Meme render spec requires an Imgflip template URL or allowed local template image",
  )
}

async function resolveAllowedTemplateImagePath({ imagePath, allowedTemplateDirectories }) {
  if (!Array.isArray(allowedTemplateDirectories) || allowedTemplateDirectories.length === 0) {
    throw new Error("Local meme template image paths require an allowed template directory")
  }

  const absoluteImagePath = resolve(imagePath)
  const imageStats = await lstat(absoluteImagePath)
  if (imageStats.isSymbolicLink()) {
    throw new Error("Local meme template image paths must not be symbolic links")
  }

  const realImagePath = await realpath(absoluteImagePath)
  const realAllowedDirectories = await Promise.all(
    allowedTemplateDirectories.map((directory) => realpath(resolve(directory))),
  )

  if (!realAllowedDirectories.some((directory) => isPathInside(realImagePath, directory))) {
    throw new Error("Local meme template image path is outside allowed template directories")
  }

  return realImagePath
}

function isPathInside(filePath, directory) {
  const relativePath = relative(directory, filePath)
  return relativePath === "" || (!relativePath.startsWith("..") && !relativePath.includes(":"))
}

function assertAllowedTemplateUrl(url) {
  let parsedUrl
  try {
    parsedUrl = new URL(url)
  } catch {
    throw new Error("Meme template URL must be a valid Imgflip HTTPS URL")
  }

  if (parsedUrl.protocol !== "https:") {
    throw new Error("Meme template URL must use HTTPS")
  }

  const isImgflipImage = parsedUrl.hostname === "i.imgflip.com"
  const isImgflipTemplate =
    parsedUrl.hostname === "imgflip.com" && parsedUrl.pathname.startsWith("/s/meme/")

  if (!isImgflipImage && !isImgflipTemplate) {
    throw new Error("Meme template URL must be an Imgflip template image URL")
  }
}

function buildTextOverlay(spec) {
  const boxes = spec.boxes.length > 0 ? spec.boxes : defaultBoxes(spec)
  const textElements = spec.texts
    .map((text, index) => buildTextElement(text, boxes[index] ?? boxes.at(-1)))
    .join("\n")

  return `<svg width="${spec.width}" height="${spec.height}" viewBox="0 0 ${spec.width} ${spec.height}" xmlns="http://www.w3.org/2000/svg">
  <style>
    .caption { fill: white; stroke: black; stroke-width: 7px; paint-order: stroke fill; stroke-linejoin: round; font-family: Impact, 'Arial Black', sans-serif; font-weight: 900; text-anchor: middle; dominant-baseline: middle; }
  </style>
  ${textElements}
</svg>`
}

function defaultBoxes(spec) {
  if (spec.texts.length === 1) {
    return [{ x: 0, y: 0, width: spec.width, height: spec.height }]
  }

  const captionHeight = Math.max(120, Math.round(spec.height * 0.22))
  return spec.texts.map((_, index) => {
    if (index === 0) {
      return { x: 0, y: 0, width: spec.width, height: captionHeight }
    }

    if (index === spec.texts.length - 1) {
      return { x: 0, y: spec.height - captionHeight, width: spec.width, height: captionHeight }
    }

    const middleHeight = Math.round(spec.height * 0.18)
    return {
      x: 0,
      y: Math.round((spec.height - middleHeight) / 2),
      width: spec.width,
      height: middleHeight,
    }
  })
}

function inferTemplateBoxes({ template, texts, width, height }) {
  const curatedBoxes = getCuratedTemplateBoxes({ template, width, height })
  if (curatedBoxes.length > 0) {
    return curatedBoxes
  }

  return buildFallbackBoxes({ count: template.box_count ?? texts.length, width, height })
}

function getCuratedTemplateBoxes({ template, width, height }) {
  const templateName = template.name?.toLowerCase() ?? ""
  const isDrakeTemplate =
    DRAKE_TEMPLATE_IDS.has(template.id ?? "") ||
    DRAKE_TEMPLATE_ALIASES.some((alias) => templateName.includes(alias))

  if (!isDrakeTemplate) {
    return []
  }

  return [
    {
      x: Math.round(width / 2),
      y: 0,
      width: Math.round(width / 2),
      height: Math.round(height / 2),
    },
    {
      x: Math.round(width / 2),
      y: Math.round(height / 2),
      width: Math.round(width / 2),
      height: Math.round(height / 2),
    },
  ]
}

function buildFallbackBoxes({ count, width, height }) {
  const boxCount = Math.max(1, Math.round(count || 1))
  if (boxCount === 1) {
    return [{ x: 0, y: 0, width, height }]
  }

  if (boxCount === 2) {
    const captionHeight = Math.max(120, Math.round(height * 0.22))
    return [
      { x: 0, y: 0, width, height: captionHeight },
      { x: 0, y: height - captionHeight, width, height: captionHeight },
    ]
  }

  const boxHeight = Math.round(height / boxCount)
  return Array.from({ length: boxCount }, (_, index) => ({
    x: 0,
    y: index * boxHeight,
    width,
    height: index === boxCount - 1 ? height - index * boxHeight : boxHeight,
  }))
}

function buildTextElement(text, box) {
  const fontSize = fitFontSize(text, box)
  const lines = wrapText(
    text,
    Math.max(1, Math.floor((box.width - TEXT_PADDING * 2) / (fontSize * 0.58))),
  )
  const lineHeight = Math.round(fontSize * 1.05)
  const firstY = box.y + box.height / 2 - ((lines.length - 1) * lineHeight) / 2
  const x = box.x + box.width / 2

  return lines
    .map(
      (line, index) =>
        `<text class="caption" x="${x}" y="${firstY + index * lineHeight}" font-size="${fontSize}">${escapeXml(line.toUpperCase())}</text>`,
    )
    .join("\n")
}

function fitFontSize(text, box) {
  for (let fontSize = Math.min(72, Math.round(box.height * 0.42)); fontSize >= 18; fontSize -= 2) {
    const charactersPerLine = Math.max(
      1,
      Math.floor((box.width - TEXT_PADDING * 2) / (fontSize * 0.58)),
    )
    const lines = wrapText(text, charactersPerLine)
    if (lines.length * fontSize * 1.05 <= box.height - TEXT_PADDING) {
      return fontSize
    }
  }

  return 18
}

function wrapText(text, charactersPerLine) {
  const words = text.split(/\s+/).filter(Boolean)
  const lines = []
  let current = ""

  for (const word of words) {
    if (word.length > charactersPerLine) {
      if (current) {
        lines.push(current)
        current = ""
      }
      lines.push(...splitLongWord(word, charactersPerLine))
      continue
    }

    const next = current ? `${current} ${word}` : word
    if (next.length > charactersPerLine && current) {
      lines.push(current)
      current = word
    } else {
      current = next
    }
  }

  if (current) {
    lines.push(current)
  }

  return lines.length > 0 ? lines : [text]
}

function splitLongWord(word, charactersPerLine) {
  const chunks = []
  for (let index = 0; index < word.length; index += charactersPerLine) {
    chunks.push(word.slice(index, index + charactersPerLine))
  }
  return chunks
}

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
}

function hashSpec(spec) {
  return createHash("sha256").update(JSON.stringify(spec)).digest("hex").slice(0, 16)
}

function posixOrNativeJoin(directory, filename) {
  const pathApi = directory.includes("\\") ? win32 : posix
  return pathApi.join(directory, filename)
}
