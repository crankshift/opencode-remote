import { describe, expect, test } from "vitest"
import { getAppDataDir, getDefaultStateDbPath } from "../../src/core/state/appDataPath.js"

describe("app data paths", () => {
  test("uses XDG_DATA_HOME on Linux when available", () => {
    expect(
      getAppDataDir({
        platform: "linux",
        env: { XDG_DATA_HOME: "/home/me/.local-data" },
        homeDir: "/home/me",
      }),
    ).toBe("/home/me/.local-data/opencode-remote")
  })

  test("falls back to ~/.local/share on Linux", () => {
    expect(getAppDataDir({ platform: "linux", env: {}, homeDir: "/home/me" })).toBe(
      "/home/me/.local/share/opencode-remote",
    )
  })

  test("uses Application Support on macOS", () => {
    expect(getAppDataDir({ platform: "darwin", env: {}, homeDir: "/Users/me" })).toBe(
      "/Users/me/Library/Application Support/opencode-remote",
    )
  })

  test("uses LOCALAPPDATA on Windows", () => {
    expect(
      getAppDataDir({
        platform: "win32",
        env: { LOCALAPPDATA: "C:\\Users\\me\\AppData\\Local" },
        homeDir: "C:\\Users\\me",
      }),
    ).toBe("C:\\Users\\me\\AppData\\Local\\opencode-remote")
  })

  test("falls back to USERPROFILE AppData on Windows", () => {
    expect(
      getAppDataDir({
        platform: "win32",
        env: { USERPROFILE: "C:\\Users\\me" },
        homeDir: "C:\\Users\\fallback",
      }),
    ).toBe("C:\\Users\\me\\AppData\\Local\\opencode-remote")
  })

  test("derives the default SQLite database path", () => {
    expect(
      getDefaultStateDbPath({
        platform: "linux",
        env: { XDG_DATA_HOME: "/home/me/.local-data" },
        homeDir: "/home/me",
      }),
    ).toBe("/home/me/.local-data/opencode-remote/opencode-remote.db")
  })

  test("adds a safe suffix to the SQLite database filename", () => {
    expect(
      getDefaultStateDbPath({
        platform: "linux",
        env: { XDG_DATA_HOME: "/home/me/.local-data" },
        homeDir: "/home/me",
        suffix: "dev",
      }),
    ).toBe("/home/me/.local-data/opencode-remote/opencode-remote-dev.db")
  })

  test("sanitizes the SQLite database filename suffix", () => {
    expect(
      getDefaultStateDbPath({
        platform: "win32",
        env: { LOCALAPPDATA: "C:\\Users\\me\\AppData\\Local" },
        homeDir: "C:\\Users\\me",
        suffix: "dev/local",
      }),
    ).toBe("C:\\Users\\me\\AppData\\Local\\opencode-remote\\opencode-remote-dev-local.db")
  })
})
