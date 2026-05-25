import { readFile } from "node:fs/promises"
import { describe, expect, test, vi } from "vitest"
import { createGatewayProgram } from "../../src/bin/program.js"

describe("opencode-remote CLI program", () => {
  test("reports the package release version", () => {
    const program = createGatewayProgram()

    expect(program.version()).toBe("0.2.0")
  })

  test("run command loads or creates config before starting the gateway", async () => {
    const config = testConfig()
    const loadOrCreateConfig = vi.fn(async () => config)
    const runGateway = vi.fn(async () => undefined)
    const program = createGatewayProgram({ loadOrCreateConfig, runGateway })

    await program.parseAsync(["node", "opencode-remote", "run"])

    expect(loadOrCreateConfig).toHaveBeenCalled()
    expect(runGateway).toHaveBeenCalledWith({ config })
  })

  test("run command passes a state DB suffix", async () => {
    const config = testConfig()
    const loadOrCreateConfig = vi.fn(async () => config)
    const runGateway = vi.fn(async () => undefined)
    const program = createGatewayProgram({ loadOrCreateConfig, runGateway })

    await program.parseAsync(["node", "opencode-remote", "run", "--state-suffix", "dev"])

    expect(runGateway).toHaveBeenCalledWith({ config, stateSuffix: "dev" })
  })

  test("dev script uses an isolated state DB suffix", async () => {
    const packageJson = JSON.parse(
      await readFile(new URL("../../package.json", import.meta.url), "utf8"),
    )

    expect(packageJson.scripts.dev).toBe(
      "node --watch src/bin/opencode-remote.js run --state-suffix dev",
    )
  })

  test("setup command creates config without starting the gateway", async () => {
    const config = testConfig()
    const createConfig = vi.fn(async () => config)
    const runGateway = vi.fn(async () => undefined)
    const output = { write: vi.fn() }
    const program = createGatewayProgram({ createConfig, runGateway, output })

    await program.parseAsync(["node", "opencode-remote", "setup"])

    expect(createConfig).toHaveBeenCalled()
    expect(runGateway).not.toHaveBeenCalled()
    expect(output.write).toHaveBeenCalledWith(`Config ready: ${config.configPath}\n`)
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

    expect(loadOrCreateConfig).toHaveBeenCalled()
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
