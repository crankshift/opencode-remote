import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, test } from "vitest"
import { clearVoiceCache, getVoiceCacheDir } from "../../src/core/voice/cache.js"

const tempDirs = []

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })))
  tempDirs.length = 0
})

describe("voice cache", () => {
  test("resolves voice cache below the app-data directory", () => {
    expect(
      getVoiceCacheDir({
        platform: "linux",
        env: { XDG_DATA_HOME: "/data" },
        homeDir: "/home/user",
      }),
    ).toBe("/data/opencode-remote/cache/voice")
  })

  test("clears generated voice cache files and leaves an empty directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "opencode-remote-voice-cache-"))
    tempDirs.push(root)
    const directory = join(root, "cache", "voice")
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, "reply.ogg"), "audio", "utf8")

    const result = await clearVoiceCache({ directory })

    expect(result.directory).toBe(directory)
    await expect(readFile(join(directory, "reply.ogg"), "utf8")).rejects.toThrow()
    await expect(readFile(directory, "utf8")).rejects.toThrow()
  })
})
