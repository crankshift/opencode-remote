import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, describe, expect, test, vi } from "vitest"
import {
  GatewayConfigError,
  loadConfig,
  loadConfigFromObject,
} from "../../src/config/loadConfig.js"
import { loadOrCreateConfig } from "../../src/config/setupConfig.js"

const tempDirs = []

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })))
  tempDirs.length = 0
})

describe("loadConfig", () => {
  test("normalizes JSON config defaults", () => {
    const cwd = "/project"
    const configPath = join(cwd, ".opencode-remote", "config.json")

    const config = loadConfigFromObject(
      {
        telegram: {
          botToken: "token",
          allowedUserId: "12345",
        },
      },
      { configPath, cwd },
    )

    expect(config).toEqual({
      configPath,
      telegram: {
        botToken: "token",
        allowedUserId: 12345,
      },
      opencode: {
        apiUrl: "http://localhost:4096",
        command: "opencode",
        autoStart: true,
        workdir: cwd,
      },
      progressVerbosity: "all",
      logLevel: "info",
      settingsPath: join(cwd, ".opencode-remote", "settings.json"),
    })
  })

  test("loads project-local config before global config", async () => {
    const { cwd, homeDir } = await tempWorkspace()
    await writeConfig(join(homeDir, ".opencode-remote", "config.json"), {
      telegram: { botToken: "global-token", allowedUserId: 111 },
    })
    await writeConfig(join(cwd, ".opencode-remote", "config.json"), {
      telegram: { botToken: "local-token", allowedUserId: 222 },
    })

    const config = await loadConfig({ cwd, homeDir })

    expect(config.configPath).toBe(join(cwd, ".opencode-remote", "config.json"))
    expect(config.telegram).toEqual({ botToken: "local-token", allowedUserId: 222 })
    expect(config.settingsPath).toBe(join(cwd, ".opencode-remote", "settings.json"))
  })

  test("loads global config when local config is missing", async () => {
    const { cwd, homeDir } = await tempWorkspace()
    await writeConfig(join(homeDir, ".opencode-remote", "config.json"), {
      telegram: { botToken: "global-token", allowedUserId: 333 },
    })

    const config = await loadConfig({ cwd, homeDir })

    expect(config.configPath).toBe(join(homeDir, ".opencode-remote", "config.json"))
    expect(config.telegram).toEqual({ botToken: "global-token", allowedUserId: 333 })
    expect(config.settingsPath).toBe(join(homeDir, ".opencode-remote", "settings.json"))
  })

  test("throws a safe missing-config error when no JSON config exists", async () => {
    const { cwd, homeDir } = await tempWorkspace()

    await expect(loadConfig({ cwd, homeDir })).rejects.toMatchObject({
      code: "missing_config",
    })

    await expect(loadConfig({ cwd, homeDir })).rejects.not.toThrow(/TELEGRAM_BOT_TOKEN/)
  })

  test("throws a safe invalid-JSON error", async () => {
    const { cwd, homeDir } = await tempWorkspace()
    const configPath = join(cwd, ".opencode-remote", "config.json")
    await mkdir(dirname(configPath), { recursive: true })
    await writeFile(configPath, "{not json", "utf8")

    await expect(loadConfig({ cwd, homeDir })).rejects.toMatchObject({
      code: "invalid_json",
      configPath,
    })
    await expect(loadConfig({ cwd, homeDir })).rejects.not.toThrow(/not json/)
  })

  test("throws safe validation errors for invalid config", async () => {
    expect(() =>
      loadConfigFromObject(
        {
          telegram: { botToken: "", allowedUserId: "abc" },
        },
        { configPath: "/project/.opencode-remote/config.json", cwd: "/project" },
      ),
    ).toThrow(GatewayConfigError)

    expect(() =>
      loadConfigFromObject(
        {
          telegram: { botToken: "", allowedUserId: "abc" },
        },
        { configPath: "/project/.opencode-remote/config.json", cwd: "/project" },
      ),
    ).toThrow(/telegram\.botToken/)
  })

  test("does not use dotenv or environment variables", async () => {
    const { cwd, homeDir } = await tempWorkspace()
    await writeFile(
      join(cwd, ".env"),
      "TELEGRAM_BOT_TOKEN=env-token\nTELEGRAM_ALLOWED_USER_ID=123\n",
      "utf8",
    )

    await expect(loadConfig({ cwd, homeDir })).rejects.toMatchObject({
      code: "missing_config",
    })
  })
})

describe("loadOrCreateConfig", () => {
  test("prompts for and writes a local config when no config exists", async () => {
    const { cwd, homeDir } = await tempWorkspace()
    const prompter = vi.fn(async () => ({
      scope: "local",
      config: {
        telegram: { botToken: "created-token", allowedUserId: 444 },
        opencode: { apiUrl: "http://localhost:4096", command: "opencode", autoStart: true },
        progressVerbosity: "all",
        logLevel: "info",
      },
    }))

    const config = await loadOrCreateConfig({ cwd, homeDir, prompter })
    const localPath = join(cwd, ".opencode-remote", "config.json")

    expect(prompter).toHaveBeenCalledWith({
      localConfigPath: localPath,
      globalConfigPath: join(homeDir, ".opencode-remote", "config.json"),
    })
    expect(config.configPath).toBe(localPath)
    expect(config.settingsPath).toBe(join(cwd, ".opencode-remote", "settings.json"))
    await expect(readJson(localPath)).resolves.toMatchObject({
      telegram: { botToken: "created-token", allowedUserId: 444 },
    })
  })

  test("prompts for and writes a global config when requested", async () => {
    const { cwd, homeDir } = await tempWorkspace()
    const prompter = vi.fn(async () => ({
      scope: "global",
      config: {
        telegram: { botToken: "created-token", allowedUserId: 555 },
      },
    }))

    const config = await loadOrCreateConfig({ cwd, homeDir, prompter })
    const globalPath = join(homeDir, ".opencode-remote", "config.json")

    expect(config.configPath).toBe(globalPath)
    expect(config.settingsPath).toBe(join(homeDir, ".opencode-remote", "settings.json"))
    await expect(readJson(globalPath)).resolves.toMatchObject({
      telegram: { botToken: "created-token", allowedUserId: 555 },
    })
  })
})

async function tempWorkspace() {
  const root = await mkdtemp(join(tmpdir(), "opencode-remote-config-"))
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
