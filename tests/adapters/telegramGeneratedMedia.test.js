import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, test, vi } from "vitest"
import {
  deliverGeneratedMedia,
  parseGeneratedMediaMarkers,
  validateGeneratedMediaPath,
} from "../../src/adapters/telegram/generatedMedia.js"

const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 1, 2, 3])
const webpBytes = Buffer.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50, 5])

const tempDirs = []

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })))
  tempDirs.length = 0
})

describe("parseGeneratedMediaMarkers", () => {
  test("removes whole-line media markers and preserves visible text", () => {
    const result = parseGeneratedMediaMarkers(
      [
        "First line",
        "  MEDIA:/tmp/generated-image.png  ",
        "Not a MEDIA:/tmp/inline.png marker",
        "MEDIA:relative.png",
        "",
        "Second line",
      ].join("\n"),
    )

    expect(result).toEqual({
      visibleText:
        "First line\nNot a MEDIA:/tmp/inline.png marker\nMEDIA:relative.png\n\nSecond line",
      mediaPaths: ["/tmp/generated-image.png"],
    })
  })
})

describe("deliverGeneratedMedia", () => {
  test("sends valid PNG, JPEG, and WebP files inside the allowed directory", async () => {
    const directory = await mkdtemp(join(tmpdir(), "telegram-generated-media-"))
    tempDirs.push(directory)
    const pngPath = join(directory, "meme.png")
    const jpegPath = join(directory, "meme.jpg")
    const webpPath = join(directory, "meme.webp")
    await writeFile(pngPath, pngBytes)
    await writeFile(jpegPath, jpegBytes)
    await writeFile(webpPath, webpBytes)
    const replyWithPhoto = vi.fn(async () => ({ message_id: 22, chat: { id: 456 } }))

    const result = await deliverGeneratedMedia({
      ctx: { replyWithPhoto },
      mediaPaths: [pngPath, jpegPath, webpPath],
      allowedDirectories: [directory],
      logger: { debug: vi.fn(), warn: vi.fn() },
    })

    expect(result).toEqual({ sent: 3, failed: 0 })
    expect(replyWithPhoto).toHaveBeenCalledTimes(3)
    expect(replyWithPhoto.mock.calls.map(([file]) => file.filename)).toEqual([
      "meme.png",
      "meme.jpg",
      "meme.webp",
    ])
    expect(replyWithPhoto.mock.calls.map(([file]) => file.fileData)).toEqual([
      pngBytes,
      jpegBytes,
      webpBytes,
    ])
    expect(replyWithPhoto.mock.calls.map(([file]) => file.fileData)).not.toContain(pngPath)
  })

  test("sends valid PNG bytes with an unknown extension", async () => {
    const directory = await mkdtemp(join(tmpdir(), "telegram-generated-media-"))
    tempDirs.push(directory)
    const imagePath = join(directory, "meme.generated")
    await writeFile(imagePath, pngBytes)
    const replyWithPhoto = vi.fn(async () => ({ message_id: 22, chat: { id: 456 } }))

    const result = await deliverGeneratedMedia({
      ctx: { replyWithPhoto },
      mediaPaths: [imagePath],
      allowedDirectories: [directory],
      logger: { debug: vi.fn(), warn: vi.fn() },
    })

    expect(result).toEqual({ sent: 1, failed: 0 })
    expect(replyWithPhoto).toHaveBeenCalledTimes(1)
    expect(replyWithPhoto.mock.calls[0][0]).toEqual(
      expect.objectContaining({ fileData: pngBytes, filename: "meme.generated" }),
    )
    expect(replyWithPhoto.mock.calls[0][0].fileData).not.toBe(imagePath)
  })

  test("rejects valid image bytes outside the allowed directory", async () => {
    const allowedDirectory = await mkdtemp(join(tmpdir(), "telegram-generated-media-allowed-"))
    const outsideDirectory = await mkdtemp(join(tmpdir(), "telegram-generated-media-outside-"))
    tempDirs.push(allowedDirectory, outsideDirectory)
    const imagePath = join(outsideDirectory, "meme.png")
    await writeFile(imagePath, pngBytes)
    const logger = { debug: vi.fn(), warn: vi.fn() }
    const replyWithPhoto = vi.fn(async () => undefined)

    const result = await deliverGeneratedMedia({
      ctx: { replyWithPhoto },
      mediaPaths: [imagePath],
      allowedDirectories: [allowedDirectory],
      logger,
    })

    expect(result).toEqual({ sent: 0, failed: 1 })
    expect(replyWithPhoto).not.toHaveBeenCalled()
    const logged = JSON.stringify(logger.warn.mock.calls)
    expect(logged).not.toContain(imagePath)
    expect(logged).toContain("outside_allowed_directory")
  })

  test("rejects symlink inside allowed directory that points outside", async () => {
    const allowedDirectory = await mkdtemp(join(tmpdir(), "telegram-generated-media-allowed-"))
    const outsideDirectory = await mkdtemp(join(tmpdir(), "telegram-generated-media-outside-"))
    tempDirs.push(allowedDirectory, outsideDirectory)
    const outsidePath = join(outsideDirectory, "meme.png")
    const symlinkPath = join(allowedDirectory, "meme.png")
    await writeFile(outsidePath, pngBytes)
    await symlink(outsidePath, symlinkPath)
    const logger = { debug: vi.fn(), warn: vi.fn() }
    const replyWithPhoto = vi.fn(async () => undefined)

    const result = await deliverGeneratedMedia({
      ctx: { replyWithPhoto },
      mediaPaths: [symlinkPath],
      allowedDirectories: [allowedDirectory],
      logger,
    })

    expect(result).toEqual({ sent: 0, failed: 1 })
    expect(replyWithPhoto).not.toHaveBeenCalled()
    const logged = JSON.stringify(logger.warn.mock.calls)
    expect(logged).not.toContain(symlinkPath)
    expect(logged).not.toContain(outsidePath)
    expect(logged).toContain("symlink")
  })

  test("rejects symlink inside allowed directory before opening", async () => {
    const directory = await mkdtemp(join(tmpdir(), "telegram-generated-media-"))
    tempDirs.push(directory)
    const targetPath = join(directory, "target.png")
    const symlinkPath = join(directory, "meme.png")
    await writeFile(targetPath, pngBytes)
    await symlink(targetPath, symlinkPath)
    const logger = { debug: vi.fn(), warn: vi.fn() }
    const replyWithPhoto = vi.fn(async () => undefined)

    const result = await deliverGeneratedMedia({
      ctx: { replyWithPhoto },
      mediaPaths: [symlinkPath],
      allowedDirectories: [directory],
      logger,
    })

    expect(result).toEqual({ sent: 0, failed: 1 })
    expect(replyWithPhoto).not.toHaveBeenCalled()
    const logged = JSON.stringify(logger.warn.mock.calls)
    expect(logged).not.toContain(symlinkPath)
    expect(logged).toContain("symlink")
  })

  test("rejects arbitrary bytes even with an allowed image extension", async () => {
    const directory = await mkdtemp(join(tmpdir(), "telegram-generated-media-"))
    tempDirs.push(directory)
    const imagePath = join(directory, "meme.png")
    await writeFile(imagePath, Buffer.from([1, 2, 3]))
    const replyWithPhoto = vi.fn(async () => undefined)

    const result = await deliverGeneratedMedia({
      ctx: { replyWithPhoto },
      mediaPaths: [imagePath],
      allowedDirectories: [directory],
      logger: { debug: vi.fn(), warn: vi.fn() },
    })

    expect(result).toEqual({ sent: 0, failed: 1 })
    expect(replyWithPhoto).not.toHaveBeenCalled()
  })

  test("handles open failures as failed media items", async () => {
    const directory = await mkdtemp(join(tmpdir(), "telegram-generated-media-"))
    tempDirs.push(directory)
    const imagePath = join(directory, "meme.generated")
    await writeFile(imagePath, pngBytes)
    const logger = { debug: vi.fn(), warn: vi.fn() }
    const replyWithPhoto = vi.fn(async () => undefined)

    const result = await deliverGeneratedMedia({
      ctx: { replyWithPhoto },
      mediaPaths: [imagePath],
      allowedDirectories: [directory],
      logger,
      validateMediaPath: (filePath) =>
        validateGeneratedMediaPath(filePath, {
          allowedDirectories: [directory],
          openFile: vi.fn(async () => {
            throw Object.assign(new Error("open failed"), { code: "EIO" })
          }),
        }),
    })

    expect(result).toEqual({ sent: 0, failed: 1 })
    expect(replyWithPhoto).not.toHaveBeenCalled()
    const logged = JSON.stringify(logger.warn.mock.calls)
    expect(logged).not.toContain(imagePath)
    expect(logged).toContain("open_failed")
  })

  test("handles validated content read failures as failed media items", async () => {
    const directory = await mkdtemp(join(tmpdir(), "telegram-generated-media-"))
    tempDirs.push(directory)
    const imagePath = join(directory, "meme.png")
    await writeFile(imagePath, pngBytes)
    const logger = { debug: vi.fn(), warn: vi.fn() }
    const replyWithPhoto = vi.fn(async () => undefined)

    const result = await deliverGeneratedMedia({
      ctx: { replyWithPhoto },
      mediaPaths: [imagePath],
      allowedDirectories: [directory],
      logger,
      validateMediaPath: (filePath) =>
        validateGeneratedMediaPath(filePath, {
          allowedDirectories: [directory],
          lstatFile: vi.fn(async () => ({
            isSymbolicLink: () => false,
            isFile: () => true,
            size: pngBytes.length,
            dev: 1,
            ino: 10,
          })),
          openFile: vi.fn(async () => ({
            stat: vi.fn(async () => ({
              isFile: () => true,
              size: pngBytes.length,
              dev: 1,
              ino: 10,
            })),
            readFile: vi.fn(async () => {
              throw Object.assign(new Error("read failed"), { code: "EIO" })
            }),
            close: vi.fn(async () => undefined),
          })),
        }),
    })

    expect(result).toEqual({ sent: 0, failed: 1 })
    expect(replyWithPhoto).not.toHaveBeenCalled()
    const logged = JSON.stringify(logger.warn.mock.calls)
    expect(logged).not.toContain(imagePath)
    expect(logged).toContain("read_failed")
  })

  test("rejects opened files that differ from the pre-open target", async () => {
    const directory = await mkdtemp(join(tmpdir(), "telegram-generated-media-"))
    tempDirs.push(directory)
    const imagePath = join(directory, "meme.png")
    await writeFile(imagePath, pngBytes)
    const logger = { debug: vi.fn(), warn: vi.fn() }
    const replyWithPhoto = vi.fn(async () => undefined)

    const result = await deliverGeneratedMedia({
      ctx: { replyWithPhoto },
      mediaPaths: [imagePath],
      allowedDirectories: [directory],
      logger,
      validateMediaPath: (filePath) =>
        validateGeneratedMediaPath(filePath, {
          allowedDirectories: [directory],
          lstatFile: vi.fn(async () => ({
            isSymbolicLink: () => false,
            isFile: () => true,
            size: pngBytes.length,
            dev: 1,
            ino: 10,
          })),
          openFile: vi.fn(async () => ({
            stat: vi.fn(async () => ({
              isFile: () => true,
              size: pngBytes.length,
              dev: 2,
              ino: 20,
            })),
            readFile: vi.fn(async () => pngBytes),
            close: vi.fn(async () => undefined),
          })),
        }),
    })

    expect(result).toEqual({ sent: 0, failed: 1 })
    expect(replyWithPhoto).not.toHaveBeenCalled()
    const logged = JSON.stringify(logger.warn.mock.calls)
    expect(logged).not.toContain(imagePath)
    expect(logged).toContain("file_changed")
  })

  test("skips unreadable generated media before sending", async () => {
    const directory = await mkdtemp(join(tmpdir(), "telegram-generated-media-"))
    tempDirs.push(directory)
    const imagePath = join(directory, "private.png")
    await writeFile(imagePath, pngBytes)
    const logger = { debug: vi.fn(), warn: vi.fn() }
    const replyWithPhoto = vi.fn(async () => undefined)

    const result = await deliverGeneratedMedia({
      ctx: { replyWithPhoto },
      mediaPaths: [imagePath],
      allowedDirectories: [directory],
      logger,
      validateMediaPath: (filePath) =>
        validateGeneratedMediaPath(filePath, {
          allowedDirectories: [directory],
          openFile: vi.fn(async () => {
            throw Object.assign(new Error("denied"), { code: "EACCES" })
          }),
        }),
    })

    expect(result).toEqual({ sent: 0, failed: 1 })
    expect(replyWithPhoto).not.toHaveBeenCalled()
    const logged = JSON.stringify(logger.warn.mock.calls)
    expect(logged).not.toContain(imagePath)
    expect(logged).toContain("not_readable")
  })

  test("rejects invalid media without logging raw private paths", async () => {
    const directory = await mkdtemp(join(tmpdir(), "telegram-generated-media-"))
    tempDirs.push(directory)
    const textPath = join(directory, "private-secret.txt")
    await writeFile(textPath, Buffer.from([1, 2, 3]))
    const logger = { debug: vi.fn(), warn: vi.fn() }
    const replyWithPhoto = vi.fn(async () => undefined)

    const result = await deliverGeneratedMedia({
      ctx: { replyWithPhoto },
      mediaPaths: ["relative.png", textPath, join(directory, "missing.png")],
      allowedDirectories: [directory],
      logger,
    })

    expect(result).toEqual({ sent: 0, failed: 3 })
    expect(replyWithPhoto).not.toHaveBeenCalled()
    const logged = JSON.stringify(logger.warn.mock.calls)
    expect(logged).not.toContain("relative.png")
    expect(logged).not.toContain("private-secret.txt")
    expect(logged).not.toContain(directory)
  })
})
