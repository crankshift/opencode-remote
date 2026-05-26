import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { PassThrough, Writable } from "node:stream"
import { afterEach, describe, expect, test, vi } from "vitest"
import {
  GatewayConfigError,
  loadConfig,
  loadConfigFromObject,
} from "../../src/config/loadConfig.js"
import { createConfig, loadOrCreateConfig, promptForConfig } from "../../src/config/setupConfig.js"

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
      progressVerbosity: "verbose",
      voice: {
        enabled: false,
        mode: "on",
        voice: "en-US-AndrewNeural",
        groqApiKey: null,
        sttModel: "whisper-large-v3-turbo",
      },
      logLevel: "info",
      settingsPath: join(cwd, ".opencode-remote", "settings.json"),
    })
  })

  test("normalizes custom voice config", () => {
    const cwd = "/project"
    const configPath = join(cwd, ".opencode-remote", "config.json")

    const config = loadConfigFromObject(
      {
        telegram: {
          botToken: "token",
          allowedUserId: 12345,
        },
        voice: {
          enabled: true,
          mode: "all",
          voice: "uk-UA-OstapNeural",
          groqApiKey: "gsk_test",
          sttModel: "whisper-large-v3",
        },
      },
      { configPath, cwd },
    )

    expect(config.voice).toEqual({
      enabled: true,
      mode: "all",
      voice: "uk-UA-OstapNeural",
      groqApiKey: "gsk_test",
      sttModel: "whisper-large-v3",
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

describe("createConfig", () => {
  test("replaces an existing config without confirmation", async () => {
    const { cwd, homeDir } = await tempWorkspace()
    const existingPath = join(cwd, ".opencode-remote", "config.json")
    await writeConfig(existingPath, {
      telegram: { botToken: "old-token", allowedUserId: 111 },
    })
    const confirmOverwrite = vi.fn(async () => false)
    const prompter = vi.fn(async () => ({
      scope: "local",
      config: {
        telegram: { botToken: "new-token", allowedUserId: 222 },
      },
    }))

    const config = await createConfig({ cwd, homeDir, prompter, confirmOverwrite })

    expect(confirmOverwrite).not.toHaveBeenCalled()
    expect(config.telegram).toEqual({ botToken: "new-token", allowedUserId: 222 })
    await expect(readJson(existingPath)).resolves.toMatchObject({
      telegram: { botToken: "new-token", allowedUserId: 222 },
    })
  })
})

describe("promptForConfig", () => {
  test("collects setup answers and leaves voice disabled by default", async () => {
    const { cwd, homeDir } = await tempWorkspace()
    const input = new PassThrough()
    const output = captureOutput()

    const prompt = promptForConfig(
      {
        localConfigPath: join(cwd, ".opencode-remote", "config.json"),
        globalConfigPath: join(homeDir, ".opencode-remote", "config.json"),
      },
      { input, output },
    )
    await writeAnswers(input, ["", "token", "123", "", "", ""])
    const answers = await prompt

    expect(answers).toEqual({
      scope: "local",
      config: {
        telegram: { botToken: "token", allowedUserId: 123 },
        progressVerbosity: "verbose",
        logLevel: "info",
      },
    })
    expect(output.text()).not.toMatch(/OpenCode API URL/)
    expect(output.text()).not.toMatch(/OpenCode command/)
    expect(output.text()).not.toMatch(/Auto-start OpenCode/)
    expect(output.text()).not.toMatch(/OpenCode workdir/)
    expect(output.text()).not.toMatch(/Settings path/)
  })

  test("collects voice setup answers when enabled", async () => {
    const { cwd, homeDir } = await tempWorkspace()
    const input = new PassThrough()
    const output = captureOutput()

    const prompt = promptForConfig(
      {
        localConfigPath: join(cwd, ".opencode-remote", "config.json"),
        globalConfigPath: join(homeDir, ".opencode-remote", "config.json"),
      },
      {
        input,
        output,
        checkFfmpeg: vi.fn(async () => ({ available: true })),
      },
    )
    await writeAnswers(input, ["", "token", "123", "", "", "yes", "gsk_test", "uk-UA-OstapNeural"])
    const answers = await prompt

    expect(answers.config.voice).toEqual({
      enabled: true,
      mode: "on",
      groqApiKey: "gsk_test",
      voice: "uk-UA-OstapNeural",
    })
  })

  test("interactive choice prompts render all options and highlight the active option", async () => {
    const { cwd, homeDir } = await tempWorkspace()
    const input = fakeTtyInput()
    const output = fakeTtyOutput()

    const prompt = promptForConfig(
      {
        localConfigPath: join(cwd, ".opencode-remote", "config.json"),
        globalConfigPath: join(homeDir, ".opencode-remote", "config.json"),
      },
      { input, output },
    )

    await pressKey(input, "\x1b[B")
    await pressKey(input, "\r")
    await pressKey(input, "token\n")
    await pressKey(input, "123\n")
    await pressKey(input, "\x1b[A")
    await pressKey(input, "\r")
    await pressKey(input, "\r")
    await pressKey(input, "\r")

    const answers = await prompt

    expect(answers.scope).toBe("global")
    expect(answers.config.progressVerbosity).toBe("all")
    expect(answers.config.logLevel).toBe("info")
    expect(output.text()).toContain("Create config where?")
    expect(output.text()).toContain("local")
    expect(output.text()).toContain("global")
    expect(output.text()).toContain("Progress verbosity")
    expect(output.text()).toContain("off")
    expect(output.text()).toContain("new")
    expect(output.text()).toContain("all")
    expect(output.text()).toContain("verbose")
    expect(output.text()).toContain("Enable voice mode now?")
    expect(output.text()).toContain("yes")
    expect(output.text()).toContain("\x1b[7m> global\x1b[0m")
    expect(output.text()).toContain("\x1b[7m> all\x1b[0m")
    expect(input.setRawMode).toHaveBeenCalledWith(true)
    expect(input.setRawMode).toHaveBeenCalledWith(false)
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

function captureOutput() {
  let text = ""
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      text += chunk.toString()
      callback()
    },
  })
  stream.text = () => text
  return stream
}

function fakeTtyInput() {
  const input = new PassThrough()
  input.isTTY = true
  input.isRaw = false
  input.setRawMode = vi.fn((enabled) => {
    input.isRaw = enabled
  })
  return input
}

function fakeTtyOutput() {
  const output = captureOutput()
  output.isTTY = true
  return output
}

async function pressKey(input, sequence) {
  await new Promise((resolve) => setTimeout(resolve, 0))
  input.write(sequence)
}

async function writeAnswers(input, answers) {
  for (const answer of answers) {
    await new Promise((resolve) => setTimeout(resolve, 0))
    input.write(`${answer}\n`)
  }
}
