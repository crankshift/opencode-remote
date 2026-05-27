import { readFile } from "node:fs/promises"
import { describe, expect, test, vi } from "vitest"
import { createGatewayProgram } from "../../src/bin/program.js"

describe("opencode-remote CLI program", () => {
  test("reports the package release version", async () => {
    const packageJson = JSON.parse(
      await readFile(new URL("../../package.json", import.meta.url), "utf8"),
    )
    const program = createGatewayProgram()

    expect(program.version()).toBe(packageJson.version)
  })

  test("run command loads or creates config before starting the gateway", async () => {
    const config = testConfig()
    const loadOrCreateConfig = vi.fn(async () => config)
    const runGateway = vi.fn(async () => undefined)
    const program = createGatewayProgram({ loadOrCreateConfig, runGateway })

    await program.parseAsync(["node", "opencode-remote", "run"])

    expect(loadOrCreateConfig).toHaveBeenCalledWith({ afterCreate: expect.any(Function) })
    expect(runGateway).toHaveBeenCalledWith({ config })
  })

  test("run command passes a state DB suffix", async () => {
    const config = testConfig()
    const loadOrCreateConfig = vi.fn(async () => config)
    const runGateway = vi.fn(async () => undefined)
    const program = createGatewayProgram({ loadOrCreateConfig, runGateway })

    await program.parseAsync(["node", "opencode-remote", "run", "--state-suffix", "dev"])

    expect(loadOrCreateConfig).toHaveBeenCalledWith({ afterCreate: expect.any(Function) })
    expect(runGateway).toHaveBeenCalledWith({ config, stateSuffix: "dev" })
  })

  test("run command enables login startup when automatic setup requested it", async () => {
    const config = testConfig()
    const loadOrCreateConfig = vi.fn(async ({ afterCreate }) => {
      await afterCreate({ config, startup: { enabled: true } })
      return config
    })
    const enableGatewayStartup = vi.fn(async () => ({
      status: "enabled",
      cwd: "/project",
      entryPath: "/startup-entry",
    }))
    const runGateway = vi.fn(async () => undefined)
    const output = { write: vi.fn() }
    const program = createGatewayProgram({
      loadOrCreateConfig,
      enableGatewayStartup,
      runGateway,
      output,
    })

    await program.parseAsync(["node", "opencode-remote", "run"])

    expect(enableGatewayStartup).toHaveBeenCalledWith({ config })
    expect(output.write).toHaveBeenCalledWith(
      "Login startup enabled for /project. Entry: /startup-entry\n",
    )
    expect(runGateway).toHaveBeenCalledWith({ config })
  })

  test("dev script uses an isolated state DB suffix", async () => {
    const packageJson = JSON.parse(
      await readFile(new URL("../../package.json", import.meta.url), "utf8"),
    )

    expect(packageJson.scripts.dev).toBe(
      "node --watch src/bin/opencode-remote.js run --state-suffix dev",
    )
  })

  test("setup script runs the source setup command", async () => {
    const packageJson = JSON.parse(
      await readFile(new URL("../../package.json", import.meta.url), "utf8"),
    )

    expect(packageJson.scripts.setup).toBe("node src/bin/opencode-remote.js setup")
  })

  test("coverage script runs Vitest coverage", async () => {
    const packageJson = JSON.parse(
      await readFile(new URL("../../package.json", import.meta.url), "utf8"),
    )

    expect(packageJson.scripts.coverage).toBe("vitest run --coverage")
  })

  test("check script gates coverage before package smoke checks", async () => {
    const packageJson = JSON.parse(
      await readFile(new URL("../../package.json", import.meta.url), "utf8"),
    )

    expect(packageJson.scripts.check).toBe(
      "pnpm run lint && pnpm run coverage && pnpm run smoke:package",
    )
  })

  test("package manager version supports setup script shorthand", async () => {
    const packageJson = JSON.parse(
      await readFile(new URL("../../package.json", import.meta.url), "utf8"),
    )

    expect(packageJson.packageManager).toMatch(/^pnpm@11\./)
  })

  test("setup command creates config without starting the gateway", async () => {
    const config = testConfig()
    const createConfig = vi.fn(async () => config)
    const runGateway = vi.fn(async () => undefined)
    const output = { write: vi.fn() }
    const program = createGatewayProgram({ createConfig, runGateway, output })

    await program.parseAsync(["node", "opencode-remote", "setup"])

    expect(createConfig).toHaveBeenCalledWith({ afterCreate: expect.any(Function) })
    expect(runGateway).not.toHaveBeenCalled()
    expect(output.write).toHaveBeenCalledWith(`Config ready: ${config.configPath}\n`)
  })

  test("setup command enables login startup when setup requested it", async () => {
    const config = testConfig()
    const createConfig = vi.fn(async ({ afterCreate }) => {
      await afterCreate({ config, startup: { enabled: true } })
      return config
    })
    const enableGatewayStartup = vi.fn(async () => ({
      status: "enabled",
      cwd: "/project",
      entryPath: "/startup-entry",
    }))
    const output = { write: vi.fn() }
    const program = createGatewayProgram({ createConfig, enableGatewayStartup, output })

    await program.parseAsync(["node", "opencode-remote", "setup"])

    expect(enableGatewayStartup).toHaveBeenCalledWith({ config })
    expect(output.write).toHaveBeenCalledWith(`Config ready: ${config.configPath}\n`)
    expect(output.write).toHaveBeenCalledWith(
      "Login startup enabled for /project. Entry: /startup-entry\n",
    )
  })

  test("start command loads or creates config before starting in background", async () => {
    const config = testConfig()
    const loadOrCreateConfig = vi.fn(async () => config)
    const startGatewayInBackground = vi.fn(async () => ({
      status: "started",
      pid: 1234,
      logPath: ".opencode-remote/gateway.log",
    }))
    const output = { write: vi.fn() }
    const program = createGatewayProgram({
      loadOrCreateConfig,
      startGatewayInBackground,
      output,
    })

    await program.parseAsync(["node", "opencode-remote", "start"])

    expect(loadOrCreateConfig).toHaveBeenCalledWith({ afterCreate: expect.any(Function) })
    expect(startGatewayInBackground).toHaveBeenCalledWith({ config })
    expect(output.write).toHaveBeenCalledWith(
      "Gateway started in background (PID 1234). Logs: .opencode-remote/gateway.log\n",
    )
  })

  test("start command reports an already running gateway", async () => {
    const config = testConfig()
    const output = { write: vi.fn() }
    const program = createGatewayProgram({
      loadOrCreateConfig: vi.fn(async () => config),
      startGatewayInBackground: vi.fn(async () => ({
        status: "already_running",
        pid: 2222,
        logPath: ".opencode-remote/gateway.log",
      })),
      output,
    })

    await program.parseAsync(["node", "opencode-remote", "start"])

    expect(output.write).toHaveBeenCalledWith(
      "Gateway is already running (PID 2222). Logs: .opencode-remote/gateway.log\n",
    )
  })

  test("stop command loads existing config and stops background gateway", async () => {
    const config = testConfig()
    const loadConfig = vi.fn(async () => config)
    const stopGatewayInBackground = vi.fn(async () => ({ status: "stopped", pid: 3333 }))
    const output = { write: vi.fn() }
    const program = createGatewayProgram({ loadConfig, stopGatewayInBackground, output })

    await program.parseAsync(["node", "opencode-remote", "stop"])

    expect(loadConfig).toHaveBeenCalled()
    expect(stopGatewayInBackground).toHaveBeenCalledWith({ config })
    expect(output.write).toHaveBeenCalledWith("Gateway stopped (PID 3333).\n")
  })

  test("status command reports running background gateway", async () => {
    const config = testConfig()
    const output = { write: vi.fn() }
    const program = createGatewayProgram({
      loadConfig: vi.fn(async () => config),
      getGatewayBackgroundStatus: vi.fn(async () => ({
        status: "running",
        pid: 4444,
        logPath: ".opencode-remote/gateway.log",
      })),
      output,
    })

    await program.parseAsync(["node", "opencode-remote", "status"])

    expect(output.write).toHaveBeenCalledWith(
      "Gateway is running (PID 4444). Logs: .opencode-remote/gateway.log\n",
    )
  })

  test("startup enable loads config and enables login startup", async () => {
    const config = testConfig()
    const loadConfig = vi.fn(async () => config)
    const enableGatewayStartup = vi.fn(async () => ({
      status: "enabled",
      cwd: "/project",
      entryPath: "/startup-entry",
    }))
    const output = { write: vi.fn() }
    const program = createGatewayProgram({ loadConfig, enableGatewayStartup, output })

    await program.parseAsync(["node", "opencode-remote", "startup", "enable"])

    expect(loadConfig).toHaveBeenCalled()
    expect(enableGatewayStartup).toHaveBeenCalledWith({ config })
    expect(output.write).toHaveBeenCalledWith(
      "Login startup enabled for /project. Entry: /startup-entry\n",
    )
  })

  test("startup disable loads config and disables login startup", async () => {
    const config = testConfig()
    const loadConfig = vi.fn(async () => config)
    const disableGatewayStartup = vi.fn(async () => ({
      status: "disabled",
      entryPath: "/startup-entry",
    }))
    const output = { write: vi.fn() }
    const program = createGatewayProgram({ loadConfig, disableGatewayStartup, output })

    await program.parseAsync(["node", "opencode-remote", "startup", "disable"])

    expect(loadConfig).toHaveBeenCalled()
    expect(disableGatewayStartup).toHaveBeenCalledWith({ config })
    expect(output.write).toHaveBeenCalledWith("Login startup disabled. Entry: /startup-entry\n")
  })

  test("startup status reports enabled login startup", async () => {
    const config = testConfig()
    const output = { write: vi.fn() }
    const program = createGatewayProgram({
      loadConfig: vi.fn(async () => config),
      getGatewayStartupStatus: vi.fn(async () => ({
        status: "enabled",
        cwd: "/project",
        entryPath: "/startup-entry",
      })),
      output,
    })

    await program.parseAsync(["node", "opencode-remote", "startup", "status"])

    expect(output.write).toHaveBeenCalledWith(
      "Login startup is enabled for /project. Entry: /startup-entry\n",
    )
  })

  test("config set updates a local config value", async () => {
    const setConfigValue = vi.fn(async () => ({ configPath: ".opencode-remote/config.json" }))
    const output = { write: vi.fn() }
    const program = createGatewayProgram({ setConfigValue, output })

    await program.parseAsync(["node", "opencode-remote", "config", "set", "voice.enabled", "true"])

    expect(setConfigValue).toHaveBeenCalledWith({
      key: "voice.enabled",
      value: "true",
      global: false,
    })
    expect(output.write).toHaveBeenCalledWith(
      "Updated voice.enabled in .opencode-remote/config.json.\n",
    )
  })

  test("config set updates a global config value", async () => {
    const setConfigValue = vi.fn(async () => ({ configPath: "~/.opencode-remote/config.json" }))
    const output = { write: vi.fn() }
    const program = createGatewayProgram({ setConfigValue, output })

    await program.parseAsync([
      "node",
      "opencode-remote",
      "config",
      "set",
      "voice.mode",
      "all",
      "-g",
    ])

    expect(setConfigValue).toHaveBeenCalledWith({
      key: "voice.mode",
      value: "all",
      global: true,
    })
    expect(output.write).toHaveBeenCalledWith(
      "Updated voice.mode in ~/.opencode-remote/config.json.\n",
    )
  })

  test("cache clear removes voice cache files", async () => {
    const clearVoiceCache = vi.fn(async () => ({ directory: "/cache/voice" }))
    const output = { write: vi.fn() }
    const program = createGatewayProgram({ clearVoiceCache, output })

    await program.parseAsync(["node", "opencode-remote", "cache", "clear"])

    expect(clearVoiceCache).toHaveBeenCalledWith()
    expect(output.write).toHaveBeenCalledWith("Cleared voice cache: /cache/voice\n")
  })
})

function testConfig() {
  return {
    configPath: ".opencode-remote/config.json",
    telegram: { botToken: "token", allowedUserId: 123 },
    opencode: {
      apiUrl: "http://localhost:4096",
      command: "opencode",
      autoStart: true,
      workdir: process.cwd(),
    },
    logLevel: "silent",
    settingsPath: ".opencode-remote/settings.json",
    progressVerbosity: "all",
  }
}
