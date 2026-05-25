import { describe, expect, test, vi } from "vitest"
import { createGatewayProgram } from "../../src/bin/program.js"

describe("gateway CLI program", () => {
  test("run command loads or creates config before starting the gateway", async () => {
    const config = {
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
    const loadOrCreateConfig = vi.fn(async () => config)
    const runGateway = vi.fn(async () => undefined)
    const program = createGatewayProgram({ loadOrCreateConfig, runGateway })

    await program.parseAsync(["node", "gateway", "run"])

    expect(loadOrCreateConfig).toHaveBeenCalled()
    expect(runGateway).toHaveBeenCalledWith({ config })
  })
})
