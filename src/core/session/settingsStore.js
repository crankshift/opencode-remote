import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname } from "node:path"

const defaultSettings = {
  activeSessionId: null,
}

export function createSettingsStore(filePath) {
  return {
    async read() {
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
    },

    async write(settings) {
      await mkdir(dirname(filePath), { recursive: true })
      const next = { ...defaultSettings, ...settings }
      await writeFile(filePath, `${JSON.stringify(next, null, 2)}\n`, "utf8")
    },
  }
}
