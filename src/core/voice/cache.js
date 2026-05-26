import { mkdir, rm } from "node:fs/promises"
import { posix, win32 } from "node:path"
import { getAppDataDir } from "../state/appDataPath.js"

export function getVoiceCacheDir(options = {}) {
  const platform = options.platform ?? process.platform
  const pathApi = platform === "win32" ? win32 : posix
  return pathApi.join(getAppDataDir({ ...options, platform }), "cache", "voice")
}

export async function clearVoiceCache(options = {}) {
  const directory = options.directory ?? getVoiceCacheDir(options)
  await rm(directory, { recursive: true, force: true })
  await mkdir(directory, { recursive: true })
  return { directory }
}
