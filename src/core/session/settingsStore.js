import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname } from "node:path"

const defaultSettings = {
  activeSessionId: null,
}

export function createSettingsStore(filePath) {
  return {
    async read() {
      return readSettings(filePath)
    },

    async write(settings) {
      await mkdir(dirname(filePath), { recursive: true })
      const current = await readSettings(filePath)
      const next = { ...defaultSettings, ...current, ...settings }
      await writeFile(filePath, `${JSON.stringify(next, null, 2)}\n`, "utf8")
    },
  }
}

async function readSettings(filePath) {
  try {
    const raw = await readFile(filePath, "utf8")
    const parsed = JSON.parse(raw)
    return { ...defaultSettings, ...parsed }
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return { ...defaultSettings }
    }
    throw error
  }
}
