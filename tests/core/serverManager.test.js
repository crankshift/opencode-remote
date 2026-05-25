import { describe, expect, test, vi } from "vitest"
import { ensureOpenCodeServer } from "../../src/core/opencode/serverManager.js"

describe("ensureOpenCodeServer", () => {
  test("does not start a child process when server is already reachable", async () => {
    const processFactory = vi.fn()
    const manager = await ensureOpenCodeServer({
      apiUrl: "http://localhost:4096",
      command: "opencode",
      autoStart: true,
      workdir: process.cwd(),
      isReachable: vi.fn().mockResolvedValue(true),
      processFactory,
      waitMs: 0,
    })

    expect(manager.started).toBe(false)
    expect(processFactory).not.toHaveBeenCalled()
  })

  test("starts opencode serve when unreachable and auto-start is enabled", async () => {
    const child = { kill: vi.fn(), stdout: null, stderr: null }
    const processFactory = vi.fn().mockReturnValue(child)
    const isReachable = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)

    const manager = await ensureOpenCodeServer({
      apiUrl: "http://localhost:4096",
      command: "opencode",
      autoStart: true,
      workdir: "/tmp/project",
      isReachable,
      processFactory,
      waitMs: 0,
      maxAttempts: 2,
    })

    expect(manager.started).toBe(true)
    expect(processFactory).toHaveBeenCalledWith("opencode", ["serve"], {
      cwd: "/tmp/project",
      reject: false,
      stdio: "pipe",
    })

    await manager.stop()
    expect(child.kill).toHaveBeenCalledWith("SIGTERM")
  })

  test("throws when unreachable and auto-start is disabled", async () => {
    await expect(
      ensureOpenCodeServer({
        apiUrl: "http://localhost:4096",
        command: "opencode",
        autoStart: false,
        workdir: process.cwd(),
        isReachable: vi.fn().mockResolvedValue(false),
        processFactory: vi.fn(),
        waitMs: 0,
      }),
    ).rejects.toThrow(/OpenCode server is not reachable/)
  })
})
