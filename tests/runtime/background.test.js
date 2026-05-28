import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, test, vi } from "vitest"
import {
  getGatewayBackgroundStatus,
  getGatewayLifecyclePaths,
  startGatewayInBackground,
  stopGatewayInBackground,
} from "../../src/runtime/background.js"

const tempDirs = []

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })))
  tempDirs.length = 0
})

describe("gateway background lifecycle", () => {
  test("derives PID and log paths beside the selected config", async () => {
    const root = await tempRoot()
    const config = testConfig(join(root, ".opencode-remote", "config.json"))

    expect(getGatewayLifecyclePaths(config)).toEqual({
      pidPath: join(root, ".opencode-remote", "gateway.pid"),
      logPath: join(root, ".opencode-remote", "gateway.log"),
    })
  })

  test("reports stopped when no PID file exists", async () => {
    const root = await tempRoot()
    const config = testConfig(join(root, ".opencode-remote", "config.json"))

    await expect(getGatewayBackgroundStatus({ config })).resolves.toMatchObject({
      status: "stopped",
    })
  })

  test("reports running when PID file points to a live process", async () => {
    const root = await tempRoot()
    const config = testConfig(join(root, ".opencode-remote", "config.json"))
    const { pidPath } = getGatewayLifecyclePaths(config)
    await mkdir(join(root, ".opencode-remote"), { recursive: true })
    await writeFile(pidPath, "1234\n", "utf8")
    const processLike = { kill: vi.fn(() => true) }

    await expect(getGatewayBackgroundStatus({ config, processLike })).resolves.toMatchObject({
      status: "running",
      pid: 1234,
    })
  })

  test("reports stale when PID file content is invalid", async () => {
    const root = await tempRoot()
    const config = testConfig(join(root, ".opencode-remote", "config.json"))
    const { pidPath } = getGatewayLifecyclePaths(config)
    await mkdir(join(root, ".opencode-remote"), { recursive: true })
    await writeFile(pidPath, "not-a-pid\n", "utf8")

    await expect(getGatewayBackgroundStatus({ config })).resolves.toMatchObject({
      status: "stale",
    })
  })

  test("starts a detached gateway and writes its PID", async () => {
    const root = await tempRoot()
    const config = testConfig(join(root, ".opencode-remote", "config.json"))
    const child = { pid: 5678, unref: vi.fn() }
    const spawnProcess = vi.fn(() => child)
    const processLike = {
      execPath: "/node",
      argv: ["/node", "/bin/opencode-remote.mjs", "start"],
      cwd: () => root,
      env: { TEST_ENV: "1" },
      kill: vi.fn(() => {
        const error = new Error("missing")
        error.code = "ESRCH"
        throw error
      }),
    }

    const result = await startGatewayInBackground({ config, processLike, spawnProcess })

    expect(result).toMatchObject({ status: "started", pid: 5678 })
    expect(spawnProcess).toHaveBeenCalledWith(
      "/node",
      ["/bin/opencode-remote.mjs", "run"],
      expect.objectContaining({
        detached: true,
        cwd: root,
        env: processLike.env,
      }),
    )
    expect(child.unref).toHaveBeenCalled()
    await expect(readFile(getGatewayLifecyclePaths(config).pidPath, "utf8")).resolves.toBe("5678\n")
  })

  test("does not start a second process when a live PID exists", async () => {
    const root = await tempRoot()
    const config = testConfig(join(root, ".opencode-remote", "config.json"))
    const { pidPath } = getGatewayLifecyclePaths(config)
    await mkdir(join(root, ".opencode-remote"), { recursive: true })
    await writeFile(pidPath, "2468\n", "utf8")
    const spawnProcess = vi.fn()
    const processLike = {
      execPath: "/node",
      argv: ["/node", "/bin/opencode-remote.mjs", "start"],
      cwd: () => root,
      env: {},
      kill: vi.fn(() => true),
    }

    const result = await startGatewayInBackground({ config, processLike, spawnProcess })

    expect(result).toMatchObject({ status: "already_running", pid: 2468 })
    expect(spawnProcess).not.toHaveBeenCalled()
  })

  test("stops a running background gateway and removes the PID file", async () => {
    const root = await tempRoot()
    const config = testConfig(join(root, ".opencode-remote", "config.json"))
    const { pidPath } = getGatewayLifecyclePaths(config)
    await mkdir(join(root, ".opencode-remote"), { recursive: true })
    await writeFile(pidPath, "1357\n", "utf8")
    const processLike = { kill: vi.fn(() => true) }

    const result = await stopGatewayInBackground({ config, processLike })

    expect(result).toMatchObject({ status: "stopped", pid: 1357 })
    expect(processLike.kill).toHaveBeenCalledWith(1357, "SIGTERM")
    await expect(readFile(pidPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" })
  })

  test("removes stale PID file on stop", async () => {
    const root = await tempRoot()
    const config = testConfig(join(root, ".opencode-remote", "config.json"))
    const { pidPath } = getGatewayLifecyclePaths(config)
    await mkdir(join(root, ".opencode-remote"), { recursive: true })
    await writeFile(pidPath, "9753\n", "utf8")
    const processLike = {
      kill: vi.fn(() => {
        const error = new Error("missing")
        error.code = "ESRCH"
        throw error
      }),
    }

    const result = await stopGatewayInBackground({ config, processLike })

    expect(result).toMatchObject({ status: "stale", pid: 9753 })
    await expect(readFile(pidPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" })
  })
})

async function tempRoot() {
  const root = await mkdtemp(join(tmpdir(), "opencode-remote-background-"))
  tempDirs.push(root)
  return root
}

function testConfig(configPath) {
  return {
    configPath,
    telegram: { botToken: "token", allowedUserIds: [123], allowedChatIds: [] },
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
