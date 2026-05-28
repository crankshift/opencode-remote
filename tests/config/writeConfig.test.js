import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, describe, expect, test } from "vitest"
import { setConfigValue, setConfigValuesAtPath } from "../../src/config/writeConfig.js"

const tempDirs = []

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })))
  tempDirs.length = 0
})

describe("setConfigValue", () => {
  test("updates a nested local config key and validates the result", async () => {
    const { cwd, homeDir } = await tempWorkspace()
    const configPath = join(cwd, ".opencode-remote", "config.json")
    await writeConfig(configPath, {
      telegram: { botToken: "token", allowedUserId: 123 },
    })

    const result = await setConfigValue({
      key: "voice.enabled",
      value: "true",
      cwd,
      homeDir,
    })

    expect(result.configPath).toBe(configPath)
    expect(result.config.voice.enabled).toBe(true)
    await expect(readJson(configPath)).resolves.toMatchObject({
      schemaVersion: 2,
      telegram: { botToken: "token", allowedUserIds: [123] },
      voice: { enabled: true },
    })
  })

  test("updates global config when requested", async () => {
    const { cwd, homeDir } = await tempWorkspace()
    const configPath = join(homeDir, ".opencode-remote", "config.json")
    await writeConfig(configPath, {
      telegram: { botToken: "token", allowedUserId: 123 },
    })

    const result = await setConfigValue({
      key: "voice.mode",
      value: "all",
      global: true,
      cwd,
      homeDir,
    })

    expect(result.configPath).toBe(configPath)
    await expect(readJson(configPath)).resolves.toMatchObject({
      schemaVersion: 2,
      telegram: { botToken: "token", allowedUserIds: [123] },
      voice: { mode: "all" },
    })
  })

  test("updates discovered global config when local config is missing", async () => {
    const { cwd, homeDir } = await tempWorkspace()
    const configPath = join(homeDir, ".opencode-remote", "config.json")
    await writeConfig(configPath, {
      telegram: { botToken: "token", allowedUserId: 123 },
    })

    const result = await setConfigValue({
      key: "voice.enabled",
      value: "true",
      cwd,
      homeDir,
    })

    expect(result.configPath).toBe(configPath)
    await expect(readJson(configPath)).resolves.toMatchObject({
      schemaVersion: 2,
      telegram: { botToken: "token", allowedUserIds: [123] },
      voice: { enabled: true },
    })
  })

  test("parses null values", async () => {
    const { cwd, homeDir } = await tempWorkspace()
    const configPath = join(cwd, ".opencode-remote", "config.json")
    await writeConfig(configPath, {
      telegram: { botToken: "token", allowedUserId: 123 },
      voice: { groqApiKey: "gsk_test" },
    })

    await setConfigValue({
      key: "voice.groqApiKey",
      value: "null",
      cwd,
      homeDir,
    })

    await expect(readJson(configPath)).resolves.toMatchObject({
      schemaVersion: 2,
      telegram: { botToken: "token", allowedUserIds: [123] },
      voice: { groqApiKey: null },
    })
  })

  test("rejects invalid keys before writing", async () => {
    const { cwd, homeDir } = await tempWorkspace()
    const configPath = join(cwd, ".opencode-remote", "config.json")
    await writeConfig(configPath, {
      telegram: { botToken: "token", allowedUserId: 123 },
    })

    await expect(setConfigValue({ key: "voice", value: "true", cwd, homeDir })).rejects.toThrow(
      /nested config key/u,
    )
    await expect(readJson(configPath)).resolves.toEqual({
      telegram: { botToken: "token", allowedUserId: 123 },
    })
  })

  test("updates multiple nested keys at an explicit config path", async () => {
    const { cwd } = await tempWorkspace()
    const configPath = join(cwd, ".opencode-remote", "config.json")
    await writeConfig(configPath, {
      telegram: { botToken: "token", allowedUserId: 123 },
      voice: { enabled: false, mode: "on" },
    })

    const result = await setConfigValuesAtPath({
      configPath,
      cwd,
      values: {
        "voice.enabled": true,
        "voice.mode": "all",
      },
    })

    expect(result.config.voice.enabled).toBe(true)
    expect(result.config.voice.mode).toBe("all")
    await expect(readJson(configPath)).resolves.toMatchObject({
      schemaVersion: 2,
      telegram: { botToken: "token", allowedUserIds: [123] },
      voice: { enabled: true, mode: "all" },
    })
  })
})

async function tempWorkspace() {
  const root = await mkdtemp(join(tmpdir(), "opencode-remote-write-config-"))
  tempDirs.push(root)
  const cwd = join(root, "project")
  const homeDir = join(root, "home")
  await mkdir(cwd, { recursive: true })
  await mkdir(homeDir, { recursive: true })
  return { cwd, homeDir }
}

async function writeConfig(filePath, config) {
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(config, null, 2)}\n`, "utf8")
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"))
}
