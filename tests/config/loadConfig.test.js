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
      schemaVersion: 2,
      configPath,
      telegram: {
        botToken: "token",
        allowedUserIds: [12345],
        allowedChatIds: [],
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

  test("migrates singular Telegram allowed user ID to plural v2 config", () => {
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

    expect(config.schemaVersion).toBe(2)
    expect(config.telegram).toEqual({
      botToken: "token",
      allowedUserIds: [12345],
      allowedChatIds: [],
    })
  })

  test("prefers plural Telegram allowed user IDs when singular and plural are both present", () => {
    const config = loadConfigFromObject(
      {
        telegram: {
          botToken: "token",
          allowedUserId: 111,
          allowedUserIds: [222, 333],
        },
      },
      { configPath: "/project/.opencode-remote/config.json", cwd: "/project" },
    )

    expect(config.telegram.allowedUserIds).toEqual([222, 333])
  })

  test("normalizes group chat allowlists without direct users", () => {
    const config = loadConfigFromObject(
      {
        schemaVersion: 2,
        telegram: {
          botToken: "token",
          allowedUserIds: [],
          allowedChatIds: [-1001, 789],
        },
      },
      { configPath: "/project/.opencode-remote/config.json", cwd: "/project" },
    )

    expect(config.telegram).toEqual({
      botToken: "token",
      allowedUserIds: [],
      allowedChatIds: [-1001, 789],
    })
  })

  test("rejects configs without direct users or allowed chats", () => {
    expect(() =>
      loadConfigFromObject(
        {
          schemaVersion: 2,
          telegram: { botToken: "token", allowedUserIds: [] },
        },
        { configPath: "/project/.opencode-remote/config.json", cwd: "/project" },
      ),
    ).toThrow(/telegram/)
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
    expect(config.telegram).toEqual({
      botToken: "local-token",
      allowedUserIds: [222],
      allowedChatIds: [],
    })
    expect(config.settingsPath).toBe(join(cwd, ".opencode-remote", "settings.json"))
  })

  test("loads global config when local config is missing", async () => {
    const { cwd, homeDir } = await tempWorkspace()
    await writeConfig(join(homeDir, ".opencode-remote", "config.json"), {
      telegram: { botToken: "global-token", allowedUserId: 333 },
    })

    const config = await loadConfig({ cwd, homeDir })

    expect(config.configPath).toBe(join(homeDir, ".opencode-remote", "config.json"))
    expect(config.telegram).toEqual({
      botToken: "global-token",
      allowedUserIds: [333],
      allowedChatIds: [],
    })
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
        schemaVersion: 2,
        telegram: { botToken: "created-token", allowedUserIds: [444] },
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
      schemaVersion: 2,
      telegram: { botToken: "created-token", allowedUserIds: [444] },
    })
  })

  test("prompts for and writes a global config when requested", async () => {
    const { cwd, homeDir } = await tempWorkspace()
    const prompter = vi.fn(async () => ({
      scope: "global",
      config: {
        schemaVersion: 2,
        telegram: { botToken: "created-token", allowedUserIds: [555] },
      },
    }))

    const config = await loadOrCreateConfig({ cwd, homeDir, prompter })
    const globalPath = join(homeDir, ".opencode-remote", "config.json")

    expect(config.configPath).toBe(globalPath)
    expect(config.settingsPath).toBe(join(homeDir, ".opencode-remote", "settings.json"))
    await expect(readJson(globalPath)).resolves.toMatchObject({
      schemaVersion: 2,
      telegram: { botToken: "created-token", allowedUserIds: [555] },
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
        schemaVersion: 2,
        telegram: { botToken: "new-token", allowedUserIds: [222] },
      },
    }))

    const config = await createConfig({ cwd, homeDir, prompter, confirmOverwrite })

    expect(confirmOverwrite).not.toHaveBeenCalled()
    expect(config.telegram).toEqual({
      botToken: "new-token",
      allowedUserIds: [222],
      allowedChatIds: [],
    })
    await expect(readJson(existingPath)).resolves.toMatchObject({
      schemaVersion: 2,
      telegram: { botToken: "new-token", allowedUserIds: [222] },
    })
  })

  test("passes startup intent to an after-create hook without writing it to JSON", async () => {
    const { cwd, homeDir } = await tempWorkspace()
    const prompter = vi.fn(async () => ({
      scope: "local",
      config: {
        schemaVersion: 2,
        telegram: { botToken: "token", allowedUserIds: [123] },
      },
      startup: { enabled: true },
    }))
    const afterCreate = vi.fn(async () => undefined)

    const config = await createConfig({ cwd, homeDir, prompter, afterCreate })
    const localPath = join(cwd, ".opencode-remote", "config.json")

    expect(afterCreate).toHaveBeenCalledWith({
      config,
      startup: { enabled: true },
    })
    await expect(readJson(localPath)).resolves.not.toHaveProperty("startup")
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
    await writeAnswers(input, ["", "token", "123", "", "", "", "", ""])
    const answers = await prompt

    expect(answers).toEqual({
      scope: "local",
      config: {
        schemaVersion: 2,
        telegram: { botToken: "token", allowedUserIds: [123] },
        progressVerbosity: "verbose",
        logLevel: "info",
      },
      startup: { enabled: false },
    })
    expect(output.text()).toContain("Group Privacy Mode")
    expect(output.text()).not.toMatch(/OpenCode API URL/)
    expect(output.text()).not.toMatch(/OpenCode command/)
    expect(output.text()).not.toMatch(/Auto-start OpenCode/)
    expect(output.text()).not.toMatch(/OpenCode workdir/)
    expect(output.text()).not.toMatch(/Settings path/)
  })

  test("collects comma-separated Telegram direct user and group chat allowlists", async () => {
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
    await writeAnswers(input, ["", "token", "1,   3", "-1001, 42", "", "", "", ""])
    const answers = await prompt

    expect(answers.config.schemaVersion).toBe(2)
    expect(answers.config.telegram).toEqual({
      botToken: "token",
      allowedUserIds: [1, 3],
      allowedChatIds: [-1001, 42],
    })
    expect(output.text()).toContain("Group Privacy Mode")
  })

  test("allows group-only setup with no direct user IDs", async () => {
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
    await writeAnswers(input, ["", "token", "", "-1001", "", "", "", ""])
    const answers = await prompt

    expect(answers.config.telegram).toEqual({
      botToken: "token",
      allowedUserIds: [],
      allowedChatIds: [-1001],
    })
  })

  test("uses existing local config values when local setup input is blank", async () => {
    const { cwd, homeDir } = await tempWorkspace()
    const localConfigPath = join(cwd, ".opencode-remote", "config.json")
    await writeConfig(localConfigPath, {
      telegram: { botToken: "existing-token", allowedUserId: 321 },
      progressVerbosity: "all",
      logLevel: "debug",
    })
    const input = new PassThrough()
    const output = captureOutput()

    const prompt = promptForConfig(
      {
        localConfigPath,
        globalConfigPath: join(homeDir, ".opencode-remote", "config.json"),
      },
      { input, output },
    )
    await writeAnswers(input, ["", "", "", "", "", "", "", ""])
    const answers = await prompt

    expect(answers).toEqual({
      scope: "local",
      config: {
        schemaVersion: 2,
        telegram: { botToken: "existing-token", allowedUserIds: [321] },
        progressVerbosity: "all",
        logLevel: "debug",
      },
      startup: { enabled: false },
    })
    expect(output.text()).toContain("Current config found")
    expect(output.text()).toContain("Telegram bot token (current: set; press Enter to keep)")
    expect(output.text()).toContain(
      "Telegram user IDs allowed to DM this bot directly, comma-separated (optional) (current: 321; press Enter to keep)",
    )
  })

  test("uses existing global config values when global setup input is blank", async () => {
    const { cwd, homeDir } = await tempWorkspace()
    const globalConfigPath = join(homeDir, ".opencode-remote", "config.json")
    await writeConfig(globalConfigPath, {
      telegram: { botToken: "global-token", allowedUserId: 654 },
      progressVerbosity: "new",
      logLevel: "warn",
    })
    const input = new PassThrough()
    const output = captureOutput()

    const prompt = promptForConfig(
      {
        localConfigPath: join(cwd, ".opencode-remote", "config.json"),
        globalConfigPath,
      },
      { input, output },
    )
    await writeAnswers(input, ["global", "", "", "", "", "", "", ""])
    const answers = await prompt

    expect(answers).toEqual({
      scope: "global",
      config: {
        schemaVersion: 2,
        telegram: { botToken: "global-token", allowedUserIds: [654] },
        progressVerbosity: "new",
        logLevel: "warn",
      },
      startup: { enabled: false },
    })
  })

  test("does not use global config values when local setup is selected", async () => {
    const { cwd, homeDir } = await tempWorkspace()
    await writeConfig(join(homeDir, ".opencode-remote", "config.json"), {
      telegram: { botToken: "global-token", allowedUserId: 654 },
      progressVerbosity: "new",
      logLevel: "warn",
    })
    const input = new PassThrough()
    const output = captureOutput()

    const prompt = promptForConfig(
      {
        localConfigPath: join(cwd, ".opencode-remote", "config.json"),
        globalConfigPath: join(homeDir, ".opencode-remote", "config.json"),
      },
      { input, output },
    )
    await writeAnswers(input, ["", "local-token", "111", "", "", "", "", ""])
    const answers = await prompt

    expect(answers.config.telegram).toEqual({ botToken: "local-token", allowedUserIds: [111] })
    expect(output.text()).not.toContain("Current config found")
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
    await writeAnswers(input, [
      "",
      "token",
      "123",
      "",
      "",
      "",
      "yes",
      "gsk_test",
      "uk-UA-OstapNeural",
      "",
    ])
    const answers = await prompt

    expect(answers.config.voice).toEqual({
      enabled: true,
      mode: "on",
      groqApiKey: "gsk_test",
      voice: "uk-UA-OstapNeural",
    })
    expect(answers.startup).toEqual({ enabled: false })
  })

  test("collects startup enablement without writing it into JSON config", async () => {
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
    await writeAnswers(input, ["", "token", "123", "", "", "", "", "yes"])
    const answers = await prompt

    expect(answers.startup).toEqual({ enabled: true })
    expect(answers.config).not.toHaveProperty("startup")
    expect(output.text()).toContain(
      "Start this gateway from the current project folder when you log in?",
    )
  })

  test("uses existing voice config values when voice setup input is blank", async () => {
    const { cwd, homeDir } = await tempWorkspace()
    const localConfigPath = join(cwd, ".opencode-remote", "config.json")
    await writeConfig(localConfigPath, {
      telegram: { botToken: "token", allowedUserId: 123 },
      voice: {
        enabled: true,
        mode: "on",
        voice: "uk-UA-OstapNeural",
        groqApiKey: "existing-groq-key",
        sttModel: "whisper-large-v3-turbo",
      },
    })
    const input = new PassThrough()
    const output = captureOutput()

    const prompt = promptForConfig(
      {
        localConfigPath,
        globalConfigPath: join(homeDir, ".opencode-remote", "config.json"),
      },
      {
        input,
        output,
        checkFfmpeg: vi.fn(async () => ({ available: true })),
      },
    )
    await writeAnswers(input, ["", "", "", "", "", "", "", "", "", ""])
    const answers = await prompt

    expect(answers.config.voice).toEqual({
      enabled: true,
      mode: "on",
      groqApiKey: "existing-groq-key",
      voice: "uk-UA-OstapNeural",
    })
    expect(answers.startup).toEqual({ enabled: false })
    expect(output.text()).toContain("Groq API key (current: set; press Enter to keep)")
    expect(output.text()).toContain(
      "Edge TTS voice (current: uk-UA-OstapNeural; press Enter to keep)",
    )
  })

  test("installs ffmpeg automatically before collecting voice setup answers", async () => {
    const { cwd, homeDir } = await tempWorkspace()
    const input = new PassThrough()
    const output = captureOutput()
    const installFfmpeg = vi.fn(async () => ({ ok: true }))

    const prompt = promptForConfig(
      {
        localConfigPath: join(cwd, ".opencode-remote", "config.json"),
        globalConfigPath: join(homeDir, ".opencode-remote", "config.json"),
      },
      {
        input,
        output,
        checkFfmpeg: vi
          .fn()
          .mockResolvedValueOnce({ available: false, message: "ffmpeg missing" })
          .mockResolvedValueOnce({ available: true }),
        detectFfmpegInstaller: vi.fn(async () => ({
          command: "brew",
          args: ["install", "ffmpeg"],
          displayCommand: "brew install ffmpeg",
        })),
        installFfmpeg,
      },
    )
    await writeAnswers(input, [
      "",
      "token",
      "123",
      "",
      "",
      "",
      "yes",
      "",
      "gsk_test",
      "uk-UA-OstapNeural",
      "",
    ])
    const answers = await prompt

    expect(installFfmpeg).toHaveBeenCalledWith({
      command: "brew",
      args: ["install", "ffmpeg"],
      displayCommand: "brew install ffmpeg",
    })
    expect(answers.config.voice).toEqual({
      enabled: true,
      mode: "on",
      groqApiKey: "gsk_test",
      voice: "uk-UA-OstapNeural",
    })
    expect(answers.startup).toEqual({ enabled: false })
    expect(output.text()).toContain("Install ffmpeg with brew install ffmpeg?")
  })

  test("waits for manual ffmpeg install when automatic install fails", async () => {
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
        checkFfmpeg: vi
          .fn()
          .mockResolvedValueOnce({ available: false, message: "ffmpeg missing" })
          .mockResolvedValueOnce({ available: false, message: "ffmpeg still missing" })
          .mockResolvedValueOnce({ available: true }),
        detectFfmpegInstaller: vi.fn(async () => ({
          command: "sudo",
          args: ["apt-get", "install", "-y", "ffmpeg"],
          displayCommand: "sudo apt-get install -y ffmpeg",
        })),
        installFfmpeg: vi.fn(async () => ({ ok: false, error: new Error("install failed") })),
      },
    )
    await writeAnswers(input, [
      "",
      "token",
      "123",
      "",
      "",
      "",
      "yes",
      "",
      "",
      "gsk_test",
      "uk-UA-OstapNeural",
      "",
    ])
    const answers = await prompt

    expect(answers.config.voice).toEqual({
      enabled: true,
      mode: "on",
      groqApiKey: "gsk_test",
      voice: "uk-UA-OstapNeural",
    })
    expect(answers.startup).toEqual({ enabled: false })
    expect(output.text()).toContain("Could not install ffmpeg automatically.")
    expect(output.text()).toContain(
      "Install ffmpeg in another terminal, then press Enter to retry, or type skip",
    )
  })

  test("continues setup with voice disabled when missing ffmpeg is skipped", async () => {
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
        checkFfmpeg: vi.fn(async () => ({ available: false, message: "ffmpeg missing" })),
        detectFfmpegInstaller: vi.fn(async () => null),
      },
    )
    await writeAnswers(input, ["", "token", "123", "", "", "", "yes", "skip", ""])
    const answers = await prompt

    expect(answers.config.voice).toBeUndefined()
    expect(answers.startup).toEqual({ enabled: false })
    expect(output.text()).toContain("No supported automatic ffmpeg installer was found.")
    expect(output.text()).toContain("Voice mode will remain disabled until ffmpeg is installed.")
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
    await pressKey(input, "\r")
    await pressKey(input, "\x1b[A")
    await pressKey(input, "\r")
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
    expect(output.text()).toContain("Start this gateway from the current project folder")
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
