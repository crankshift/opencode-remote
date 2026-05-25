import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, test } from "vitest"
import { createSettingsStore } from "../../src/core/session/settingsStore.js"

const tempDirs = []

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })))
  tempDirs.length = 0
})

async function tempSettingsPath() {
  const dir = await mkdtemp(join(tmpdir(), "opencode-remote-"))
  tempDirs.push(dir)
  return join(dir, "settings.json")
}

describe("settingsStore", () => {
  test("returns defaults when settings file does not exist", async () => {
    const store = createSettingsStore(await tempSettingsPath())

    await expect(store.read()).resolves.toEqual({ activeSessionId: null })
  })

  test("persists active session ID", async () => {
    const store = createSettingsStore(await tempSettingsPath())

    await store.write({ activeSessionId: "ses_123" })

    await expect(store.read()).resolves.toEqual({ activeSessionId: "ses_123" })
  })
})
