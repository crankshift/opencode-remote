import { mkdtemp, stat, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { isAbsolute, join } from "node:path"
import sharp from "sharp"
import { describe, expect, test } from "vitest"
import {
  getGeneratedMediaCacheDir,
  normalizeRenderSpec,
  renderMemeFromSpec,
} from "../../src/core/memes/renderer.js"

describe("meme renderer", () => {
  test("returns the generated media cache directory under app data", () => {
    const directory = getGeneratedMediaCacheDir({
      platform: "linux",
      env: { XDG_DATA_HOME: "/data" },
      homeDir: "/home/test",
    })

    expect(directory).toBe("/data/opencode-remote/cache/generated-media")
  })

  test("normalizes render specs and clamps supplied boxes to image bounds", () => {
    const spec = normalizeRenderSpec({
      template: { id: 123, name: "  Drake  ", url: " https://example.test/template.png " },
      width: 400,
      height: 300,
      texts: [" top text ", ""],
      boxes: [{ x: -10, y: 250, width: 500, height: 100 }],
    })

    expect(spec).toMatchObject({
      template: { id: "123", name: "Drake", url: "https://example.test/template.png" },
      width: 400,
      height: 300,
      texts: ["top text"],
      boxes: [{ x: 0, y: 250, width: 400, height: 50 }],
    })
  })

  test("uses template dimensions and preserves template box count", () => {
    const spec = normalizeRenderSpec({
      template: { width: 1200, height: 900, box_count: 3 },
      texts: ["one", "two", "three"],
    })

    expect(spec.width).toBe(1200)
    expect(spec.height).toBe(900)
    expect(spec.template.box_count).toBe(3)
  })

  test("selects curated boxes for Drake Hotline Bling when explicit boxes are absent", () => {
    const spec = normalizeRenderSpec({
      template: { id: "181913649", name: "Drake Hotline Bling", width: 1200, height: 1200 },
      texts: ["no", "yes"],
    })

    expect(spec.boxes).toEqual([
      { x: 600, y: 0, width: 600, height: 600 },
      { x: 600, y: 600, width: 600, height: 600 },
    ])
  })

  test("rejects render specs without non-empty text", () => {
    expect(() => normalizeRenderSpec({ texts: ["  "] })).toThrow(/at least one non-empty text/i)
  })

  test("rejects render specs without a template source", async () => {
    await expect(
      renderMemeFromSpec({
        outputDirectory: await makeTempDirectory(),
        spec: { texts: ["do not invent poster"] },
      }),
    ).rejects.toThrow(/requires an Imgflip template URL or allowed local template image/i)
  })

  test("renders a PNG from a local template image and returns a media marker", async () => {
    const directory = await makeTempDirectory()
    const templatePath = join(directory, "template.png")
    await writeFile(templatePath, await makeTemplateBuffer({ width: 320, height: 240 }))

    const result = await renderMemeFromSpec({
      outputDirectory: join(directory, "out"),
      allowedTemplateDirectories: [directory],
      spec: {
        template: { imagePath: templatePath },
        width: 320,
        height: 240,
        texts: ["locally rendered", "meme text"],
      },
    })

    const outputStats = await stat(result.filePath)
    expect(outputStats.size).toBeGreaterThan(0)
    expect(result.filePath).toMatch(/\.png$/)
    expect(result.mediaMarker).toBe(`MEDIA:${result.filePath}`)
  })

  test("keeps rendered text inside explicit text boxes", async () => {
    const directory = await makeTempDirectory()
    const templatePath = join(directory, "template.png")
    await writeFile(
      templatePath,
      await sharp({
        create: { width: 360, height: 180, channels: 3, background: "#ffffff" },
      })
        .png()
        .toBuffer(),
    )

    const box = { x: 120, y: 30, width: 90, height: 80 }
    const result = await renderMemeFromSpec({
      outputDirectory: join(directory, "out"),
      allowedTemplateDirectories: [directory],
      spec: {
        template: { imagePath: templatePath },
        width: 360,
        height: 180,
        boxes: [box],
        texts: ["WWWWWW WWWWWW"],
      },
    })

    const image = await sharp(result.filePath).raw().toBuffer({ resolveWithObject: true })
    expect(hasNonWhitePixelOutsideBox(image, box)).toBe(false)
  })

  test("fetches a template URL with injected fetch and renders without live network", async () => {
    const directory = await makeTempDirectory()
    const templateBuffer = await makeTemplateBuffer({ width: 200, height: 160 })
    let fetchOptions
    const fetchImpl = async (url, options) => {
      fetchOptions = options
      return {
        ok: true,
        status: 200,
        arrayBuffer: async () =>
          templateBuffer.buffer.slice(
            templateBuffer.byteOffset,
            templateBuffer.byteOffset + templateBuffer.byteLength,
          ),
        url,
      }
    }

    const result = await renderMemeFromSpec({
      outputDirectory: directory,
      fetchImpl,
      spec: {
        template: { url: "https://i.imgflip.com/template.png" },
        texts: ["fetched template"],
      },
    })

    expect((await stat(result.filePath)).size).toBeGreaterThan(0)
    expect(result.mediaMarker).toBe(`MEDIA:${result.filePath}`)
    expect(fetchOptions).toEqual({ redirect: "error" })
  })

  test("rejects redirected template responses outside Imgflip", async () => {
    const templateBuffer = await makeTemplateBuffer({ width: 200, height: 160 })
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      url: "https://evil.example/meme.jpg",
      arrayBuffer: async () =>
        templateBuffer.buffer.slice(
          templateBuffer.byteOffset,
          templateBuffer.byteOffset + templateBuffer.byteLength,
        ),
    })

    await expect(
      renderMemeFromSpec({
        outputDirectory: await makeTempDirectory(),
        fetchImpl,
        spec: {
          template: { url: "https://i.imgflip.com/template.png" },
          texts: ["blocked redirect"],
        },
      }),
    ).rejects.toThrow(/imgflip/i)
  })

  test("rejects non-Imgflip remote template URLs", async () => {
    await expect(
      renderMemeFromSpec({
        outputDirectory: await makeTempDirectory(),
        fetchImpl: async () => {
          throw new Error("fetch should not be called")
        },
        spec: {
          template: { url: "https://example.test/template.png" },
          texts: ["blocked"],
        },
      }),
    ).rejects.toThrow(/imgflip/i)
  })

  test("rejects non-HTTPS Imgflip remote template URLs", async () => {
    await expect(
      renderMemeFromSpec({
        outputDirectory: await makeTempDirectory(),
        fetchImpl: async () => {
          throw new Error("fetch should not be called")
        },
        spec: {
          template: { url: "http://i.imgflip.com/test.jpg" },
          texts: ["blocked"],
        },
      }),
    ).rejects.toThrow(/https/i)
  })

  test("allows Imgflip meme page template URLs", async () => {
    const directory = await makeTempDirectory()
    const templateBuffer = await makeTemplateBuffer({ width: 200, height: 160 })
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () =>
        templateBuffer.buffer.slice(
          templateBuffer.byteOffset,
          templateBuffer.byteOffset + templateBuffer.byteLength,
        ),
    })

    const result = await renderMemeFromSpec({
      outputDirectory: directory,
      fetchImpl,
      spec: {
        template: { url: "https://imgflip.com/s/meme/Drake-Hotline-Bling.jpg" },
        texts: ["accepted"],
      },
    })

    expect((await stat(result.filePath)).size).toBeGreaterThan(0)
  })

  test("rejects local template images unless an allowed directory contains them", async () => {
    const directory = await makeTempDirectory()
    const templatePath = join(directory, "template.png")
    await writeFile(templatePath, await makeTemplateBuffer({ width: 120, height: 120 }))

    await expect(
      renderMemeFromSpec({
        outputDirectory: join(directory, "out"),
        spec: { template: { imagePath: templatePath }, texts: ["blocked local"] },
      }),
    ).rejects.toThrow(/allowed template director/i)
  })

  test("allows local template images contained in an allowed directory", async () => {
    const directory = await makeTempDirectory()
    const templatePath = join(directory, "template.png")
    await writeFile(templatePath, await makeTemplateBuffer({ width: 120, height: 120 }))

    const result = await renderMemeFromSpec({
      outputDirectory: join(directory, "out"),
      allowedTemplateDirectories: [directory],
      spec: { template: { imagePath: templatePath }, texts: ["allowed local"] },
    })

    expect((await stat(result.filePath)).size).toBeGreaterThan(0)
  })

  test("rejects local template images outside allowed directories", async () => {
    const allowedDirectory = await makeTempDirectory()
    const outsideDirectory = await makeTempDirectory()
    const templatePath = join(outsideDirectory, "template.png")
    await writeFile(templatePath, await makeTemplateBuffer({ width: 120, height: 120 }))

    await expect(
      renderMemeFromSpec({
        outputDirectory: join(allowedDirectory, "out"),
        allowedTemplateDirectories: [allowedDirectory],
        spec: { template: { imagePath: templatePath }, texts: ["blocked outside"] },
      }),
    ).rejects.toThrow(/outside allowed template directories/i)
  })

  test.skipIf(process.platform === "win32")(
    "rejects a final symlink inside an allowed directory",
    async () => {
      const allowedDirectory = await makeTempDirectory()
      const outsideDirectory = await makeTempDirectory()
      const outsideTemplatePath = join(outsideDirectory, "template.png")
      const symlinkPath = join(allowedDirectory, "template-link.png")
      await writeFile(outsideTemplatePath, await makeTemplateBuffer({ width: 120, height: 120 }))
      await symlink(outsideTemplatePath, symlinkPath)

      await expect(
        renderMemeFromSpec({
          outputDirectory: join(allowedDirectory, "out"),
          allowedTemplateDirectories: [allowedDirectory],
          spec: { template: { imagePath: symlinkPath }, texts: ["blocked symlink"] },
        }),
      ).rejects.toThrow(/symbolic links/i)
    },
  )

  test.skipIf(process.platform === "win32")(
    "rejects a symlinked parent escaping an allowed directory",
    async () => {
      const allowedDirectory = await makeTempDirectory()
      const outsideDirectory = await makeTempDirectory()
      const outsideTemplatePath = join(outsideDirectory, "template.png")
      const symlinkedParentPath = join(allowedDirectory, "outside-link")
      await writeFile(outsideTemplatePath, await makeTemplateBuffer({ width: 120, height: 120 }))
      await symlink(outsideDirectory, symlinkedParentPath)

      await expect(
        renderMemeFromSpec({
          outputDirectory: join(allowedDirectory, "out"),
          allowedTemplateDirectories: [allowedDirectory],
          spec: {
            template: { imagePath: join(symlinkedParentPath, "template.png") },
            texts: ["blocked parent symlink"],
          },
        }),
      ).rejects.toThrow(/outside allowed template directories/i)
    },
  )

  test("resolves a relative output directory before returning the media marker", async () => {
    const originalCwd = process.cwd()
    const directory = await makeTempDirectory()
    const templatePath = join(directory, "template.png")
    await writeFile(templatePath, await makeTemplateBuffer({ width: 120, height: 120 }))

    let result
    try {
      process.chdir(directory)
      result = await renderMemeFromSpec({
        outputDirectory: join("relative-meme-output", `${process.pid}-${Date.now()}`),
        allowedTemplateDirectories: [directory],
        spec: { template: { imagePath: templatePath }, texts: ["absolute marker"] },
      })
    } finally {
      process.chdir(originalCwd)
    }

    expect(isAbsolute(result.filePath)).toBe(true)
    expect(result.mediaMarker).toBe(`MEDIA:${result.filePath}`)
    expect(result.mediaMarker).toMatch(/^MEDIA:\//)
  })
})

async function makeTempDirectory() {
  return mkdtemp(join(tmpdir(), `opencode-remote-meme-test-${process.pid}-`))
}

async function makeTemplateBuffer({ width, height }) {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: "#335577",
    },
  })
    .png()
    .toBuffer()
}

function hasNonWhitePixelOutsideBox({ data, info }, box) {
  const channels = info.channels
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (isInsideBox({ x, y }, box)) {
        continue
      }
      const offset = (y * info.width + x) * channels
      const red = data[offset]
      const green = data[offset + 1]
      const blue = data[offset + 2]
      if (red < 250 || green < 250 || blue < 250) {
        return true
      }
    }
  }
  return false
}

function isInsideBox({ x, y }, box) {
  return x >= box.x && x < box.x + box.width && y >= box.y && y < box.y + box.height
}
