import { describe, expect, test, vi } from "vitest"
import {
  defaultReachabilityCheck,
  ensureOpenCodeServer,
} from "../../src/core/opencode/serverManager.js"

describe("ensureOpenCodeServer", () => {
  test("passes a timeout signal to fetch reachability checks", async () => {
    const originalFetch = globalThis.fetch
    const fetch = vi.fn(async () => ({ ok: true, status: 200 }))
    globalThis.fetch = fetch

    try {
      await expect(
        defaultReachabilityCheck("http://localhost:4096", { timeoutMs: 10 }),
      ).resolves.toBe(true)
    } finally {
      globalThis.fetch = originalFetch
    }

    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:4096",
      expect.objectContaining({
        method: "GET",
        signal: expect.any(AbortSignal),
      }),
    )
  })

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

  test("does not start a child process when a reachable server responds after 100ms", async () => {
    const processFactory = vi.fn()
    const isReachable = vi.fn(() => new Promise((resolve) => setTimeout(() => resolve(true), 150)))

    const manager = await ensureOpenCodeServer({
      apiUrl: "http://localhost:4096",
      command: "opencode",
      autoStart: true,
      workdir: process.cwd(),
      isReachable,
      processFactory,
      waitMs: 200,
      maxAttempts: 1,
    })

    expect(manager.started).toBe(false)
    expect(processFactory).not.toHaveBeenCalled()
  })

  test("starts opencode serve on the configured localhost port", async () => {
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
      waitMs: 5,
      maxAttempts: 5,
    })

    expect(manager.started).toBe(true)
    expect(processFactory).toHaveBeenCalledWith("opencode", ["serve", "--port", "4096"], {
      cwd: "/tmp/project",
      reject: false,
      stdio: "pipe",
    })

    await manager.stop()
    expect(child.kill).toHaveBeenCalledWith("SIGTERM")
  })

  test("starts opencode serve on the configured loopback IP port", async () => {
    const child = { kill: vi.fn(), stdout: null, stderr: null }
    const processFactory = vi.fn().mockReturnValue(child)
    const isReachable = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)

    await ensureOpenCodeServer({
      apiUrl: "http://127.0.0.1:7777",
      command: "opencode",
      autoStart: true,
      workdir: "/tmp/project",
      isReachable,
      processFactory,
      waitMs: 5,
      maxAttempts: 5,
    })

    expect(processFactory).toHaveBeenCalledWith("opencode", ["serve", "--port", "7777"], {
      cwd: "/tmp/project",
      reject: false,
      stdio: "pipe",
    })
  })

  test("keeps default serve args for remote API URLs", async () => {
    const child = { kill: vi.fn(), stdout: null, stderr: null }
    const processFactory = vi.fn().mockReturnValue(child)
    const isReachable = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)

    await ensureOpenCodeServer({
      apiUrl: "http://192.168.1.10:4096",
      command: "opencode",
      autoStart: true,
      workdir: "/tmp/project",
      isReachable,
      processFactory,
      waitMs: 5,
      maxAttempts: 5,
    })

    expect(processFactory).toHaveBeenCalledWith("opencode", ["serve"], {
      cwd: "/tmp/project",
      reject: false,
      stdio: "pipe",
    })
  })

  test("keeps default serve args for IPv6 loopback API URLs", async () => {
    const child = { kill: vi.fn(), stdout: null, stderr: null }
    const processFactory = vi.fn().mockReturnValue(child)
    const isReachable = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)

    await ensureOpenCodeServer({
      apiUrl: "http://[::1]:4096",
      command: "opencode",
      autoStart: true,
      workdir: "/tmp/project",
      isReachable,
      processFactory,
      waitMs: 5,
      maxAttempts: 5,
    })

    expect(processFactory).toHaveBeenCalledWith("opencode", ["serve"], {
      cwd: "/tmp/project",
      reject: false,
      stdio: "pipe",
    })
  })

  test("waits up to 60 seconds by default before failing", async () => {
    vi.useFakeTimers()
    const child = { kill: vi.fn(), stdout: null, stderr: null }
    const processFactory = vi.fn().mockReturnValue(child)
    const isReachable = vi.fn().mockResolvedValue(false)

    try {
      const result = ensureOpenCodeServer({
        apiUrl: "http://localhost:4096",
        command: "opencode",
        autoStart: true,
        workdir: "/tmp/project",
        isReachable,
        processFactory,
      })

      await vi.advanceTimersByTimeAsync(60_000)
      await expect(result).rejects.toThrow(/OpenCode server did not become reachable/)
    } finally {
      vi.useRealTimers()
    }

    expect(child.kill).toHaveBeenCalledWith("SIGTERM")
  })

  test("times out hung reachability checks", async () => {
    const child = { kill: vi.fn(), stdout: null, stderr: null }
    const processFactory = vi.fn().mockReturnValue(child)
    const isReachable = vi.fn(() => new Promise(() => {}))

    const result = await Promise.race([
      ensureOpenCodeServer({
        apiUrl: "http://localhost:4096",
        command: "opencode",
        autoStart: true,
        workdir: "/tmp/project",
        isReachable,
        processFactory,
        waitMs: 5,
        maxAttempts: 2,
        reachabilityTimeoutMs: 1,
      }).catch((error) => error),
      new Promise((resolve) => setTimeout(() => resolve("still waiting"), 50)),
    ])

    expect(result).toBeInstanceOf(Error)
    expect(result.message).toMatch(/OpenCode server did not become reachable/)
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
