import { homedir } from "node:os"
import { posix, win32 } from "node:path"

export const STATE_DB_FILE_NAME = "opencode-remote.db"
const APP_NAME = "opencode-remote"

export function getAppDataDir({
  platform = process.platform,
  env = process.env,
  homeDir = homedir(),
} = {}) {
  if (platform === "win32") {
    const base =
      env.LOCALAPPDATA || env.APPDATA || win32.join(env.USERPROFILE || homeDir, "AppData", "Local")
    return win32.join(base, APP_NAME)
  }

  if (platform === "darwin") {
    return posix.join(homeDir, "Library", "Application Support", APP_NAME)
  }

  return posix.join(env.XDG_DATA_HOME || posix.join(homeDir, ".local", "share"), APP_NAME)
}

export function getDefaultStateDbPath(options = {}) {
  const platform = options.platform ?? process.platform
  const pathApi = platform === "win32" ? win32 : posix
  return pathApi.join(getAppDataDir({ ...options, platform }), stateDbFileName(options.suffix))
}

function stateDbFileName(suffix) {
  const safeSuffix = sanitizeSuffix(suffix)
  if (!safeSuffix) {
    return STATE_DB_FILE_NAME
  }
  return `opencode-remote-${safeSuffix}.db`
}

function sanitizeSuffix(suffix) {
  return String(suffix ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
}
