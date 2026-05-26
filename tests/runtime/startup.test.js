import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, test, vi } from "vitest"
import {
  disableGatewayStartup,
  enableGatewayStartup,
  getGatewayStartupStatus,
} from "../../src/runtime/startup.js"

const tempDirs = []

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })))
  tempDirs.length = 0
})

describe("gateway login startup lifecycle", () => {
  test("writes a macOS LaunchAgent that starts the gateway from the project folder", async () => {
    const root = await tempRoot()
    const homeDir = join(root, "home")
    const cwd = join(root, "project")
    const config = testConfig(join(cwd, ".opencode-remote", "config.json"))

    const result = await enableGatewayStartup({
      config,
      cwd,
      homeDir,
      platform: "darwin",
      processLike: testProcess(),
    })

    expect(result).toMatchObject({ status: "enabled", platform: "darwin", cwd })
    expect(result.entryPath).toMatch(
      /Library\/LaunchAgents\/com\.crankshift\.opencode-remote\.[a-f0-9]+\.plist$/,
    )
    await expect(readFile(result.entryPath, "utf8")).resolves.toContain(
      "<string>/bin/opencode-remote.mjs</string>",
    )
    await expect(readFile(result.entryPath, "utf8")).resolves.toContain("<string>start</string>")
    await expect(readFile(result.entryPath, "utf8")).resolves.toContain(
      `<string>${escapeXml(cwd)}</string>`,
    )
  })

  test("writes and enables a Linux systemd user service", async () => {
    const root = await tempRoot()
    const homeDir = join(root, "home")
    const cwd = join(root, "project")
    const config = testConfig(join(cwd, ".opencode-remote", "config.json"))
    const runCommand = vi.fn(async () => undefined)

    const result = await enableGatewayStartup({
      config,
      cwd,
      homeDir,
      platform: "linux",
      processLike: testProcess(),
      runCommand,
    })

    expect(result).toMatchObject({ status: "enabled", platform: "linux", cwd })
    expect(result.entryPath).toMatch(/\.config\/systemd\/user\/opencode-remote-[a-f0-9]+\.service$/)
    await expect(readFile(result.entryPath, "utf8")).resolves.toContain(`WorkingDirectory=${cwd}`)
    await expect(readFile(result.entryPath, "utf8")).resolves.toContain(
      "ExecStart=/node /bin/opencode-remote.mjs start",
    )
    expect(runCommand).toHaveBeenNthCalledWith(1, "systemctl", ["--user", "daemon-reload"])
    expect(runCommand).toHaveBeenNthCalledWith(2, "systemctl", [
      "--user",
      "enable",
      result.entryName,
    ])
  })

  test("quotes Linux service command paths that contain spaces", async () => {
    const root = await tempRoot()
    const homeDir = join(root, "home")
    const cwd = join(root, "project with spaces")
    const config = testConfig(join(cwd, ".opencode-remote", "config.json"))

    const result = await enableGatewayStartup({
      config,
      cwd,
      homeDir,
      platform: "linux",
      processLike: testProcess({
        execPath: "/opt/node bin/node",
        argv: ["node", "/opt/open code/opencode-remote.mjs"],
      }),
      runCommand: vi.fn(async () => undefined),
    })

    await expect(readFile(result.entryPath, "utf8")).resolves.toContain(
      'ExecStart="/opt/node bin/node" "/opt/open code/opencode-remote.mjs" start',
    )
  })

  test("creates a Windows scheduled task for user logon", async () => {
    const root = await tempRoot()
    const homeDir = join(root, "home")
    const cwd = join(root, "project")
    const config = testConfig(join(cwd, ".opencode-remote", "config.json"))
    const runCommand = vi.fn(async () => undefined)

    const result = await enableGatewayStartup({
      config,
      cwd,
      homeDir,
      platform: "win32",
      processLike: testProcess({
        execPath: "C:\\Node\\node.exe",
        argv: ["node", "C:\\bin\\opencode-remote.mjs"],
      }),
      runCommand,
    })

    expect(result).toMatchObject({ status: "enabled", platform: "win32", cwd })
    expect(result.entryName).toMatch(/^OpenCode Remote [a-f0-9]+$/)
    expect(runCommand).toHaveBeenCalledWith("schtasks", [
      "/Create",
      "/F",
      "/SC",
      "ONLOGON",
      "/TN",
      result.entryName,
      "/TR",
      `cmd /d /s /c "cd /d "${cwd}" && "C:\\Node\\node.exe" "C:\\bin\\opencode-remote.mjs" start"`,
    ])
  })

  test("reports enabled startup when the entry file exists", async () => {
    const root = await tempRoot()
    const homeDir = join(root, "home")
    const cwd = join(root, "project")
    const config = testConfig(join(cwd, ".opencode-remote", "config.json"))
    const enabled = await enableGatewayStartup({
      config,
      cwd,
      homeDir,
      platform: "darwin",
      processLike: testProcess(),
    })

    await expect(
      getGatewayStartupStatus({ config, cwd, homeDir, platform: "darwin" }),
    ).resolves.toMatchObject({
      status: "enabled",
      entryPath: enabled.entryPath,
      cwd,
    })
  })

  test("disables a Linux systemd user service and removes the entry", async () => {
    const root = await tempRoot()
    const homeDir = join(root, "home")
    const cwd = join(root, "project")
    const config = testConfig(join(cwd, ".opencode-remote", "config.json"))
    const runCommand = vi.fn(async () => undefined)
    const enabled = await enableGatewayStartup({
      config,
      cwd,
      homeDir,
      platform: "linux",
      processLike: testProcess(),
      runCommand,
    })

    const result = await disableGatewayStartup({
      config,
      cwd,
      homeDir,
      platform: "linux",
      runCommand,
    })

    expect(result).toMatchObject({ status: "disabled", entryPath: enabled.entryPath })
    await expect(readFile(enabled.entryPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" })
    expect(runCommand).toHaveBeenNthCalledWith(3, "systemctl", [
      "--user",
      "disable",
      enabled.entryName,
    ])
    expect(runCommand).toHaveBeenNthCalledWith(4, "systemctl", ["--user", "daemon-reload"])
  })

  test("linux disable is safe when the startup entry is already absent", async () => {
    const root = await tempRoot()
    const homeDir = join(root, "home")
    const cwd = join(root, "project")
    const config = testConfig(join(cwd, ".opencode-remote", "config.json"))
    const runCommand = vi.fn(async () => undefined)

    const result = await disableGatewayStartup({
      config,
      cwd,
      homeDir,
      platform: "linux",
      runCommand,
    })

    expect(result).toMatchObject({ status: "disabled", platform: "linux", cwd })
    expect(runCommand).not.toHaveBeenCalled()
  })

  test("windows disable is safe when the scheduled task is already absent", async () => {
    const root = await tempRoot()
    const cwd = join(root, "project")
    const config = testConfig(join(cwd, ".opencode-remote", "config.json"))
    const runCommand = vi.fn(async () => {
      throw new Error("task missing")
    })

    const result = await disableGatewayStartup({
      config,
      cwd,
      homeDir: root,
      platform: "win32",
      runCommand,
    })

    expect(result).toMatchObject({ status: "disabled", platform: "win32", cwd })
    expect(runCommand).toHaveBeenCalledWith("schtasks", ["/Query", "/TN", result.entryName])
  })

  test("returns unsupported for unsupported platforms", async () => {
    const root = await tempRoot()
    const cwd = join(root, "project")
    const config = testConfig(join(cwd, ".opencode-remote", "config.json"))

    await expect(
      enableGatewayStartup({ config, cwd, homeDir: root, platform: "freebsd" }),
    ).resolves.toMatchObject({ status: "unsupported", platform: "freebsd" })
  })
})

async function tempRoot() {
  const root = await mkdtemp(join(tmpdir(), "opencode-remote-startup-"))
  tempDirs.push(root)
  return root
}

function testConfig(configPath) {
  return {
    configPath,
    telegram: { botToken: "token", allowedUserId: 123 },
    opencode: {
      apiUrl: "http://localhost:4096",
      command: "opencode",
      autoStart: true,
      workdir: process.cwd(),
    },
    logLevel: "silent",
    settingsPath: join(configPath, "..", "settings.json"),
    progressVerbosity: "all",
  }
}

function testProcess(overrides = {}) {
  return {
    execPath: "/node",
    argv: ["/node", "/bin/opencode-remote.mjs"],
    ...overrides,
  }
}

function escapeXml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
}
