import { describe, expect, test, vi } from "vitest"
import { createGatewayController } from "../../src/core/gateway/controller.js"

function createStore(initial = { activeSessionId: null }) {
  let state = initial
  return {
    read: vi.fn(async () => state),
    write: vi.fn(async (next) => {
      state = { ...state, ...next }
    }),
  }
}

describe("gatewayController", () => {
  test("creates and selects a session", async () => {
    const store = createStore()
    const opencode = {
      createSession: vi.fn(async () => ({ id: "ses_1", title: "New session" })),
    }
    const controller = createGatewayController({ opencode, store })

    const result = await controller.createSession()

    expect(result).toEqual({ id: "ses_1", title: "New session" })
    expect(store.write).toHaveBeenCalledWith({ activeSessionId: "ses_1" })
  })

  test("status includes configured progress verbosity", async () => {
    const store = createStore({ activeSessionId: "ses_1" })
    const controller = createGatewayController({
      opencode: {},
      store,
      defaultProgressVerbosity: "verbose",
    })

    await expect(controller.status()).resolves.toEqual({
      activeSessionId: "ses_1",
      progressVerbosity: "verbose",
    })
  })

  test("stored progress verbosity overrides the configured default", async () => {
    const store = createStore({ activeSessionId: "ses_1", progressVerbosity: "off" })
    const controller = createGatewayController({
      opencode: {},
      store,
      defaultProgressVerbosity: "verbose",
    })

    await expect(controller.getProgressVerbosity()).resolves.toBe("off")
  })

  test("persists progress verbosity", async () => {
    const store = createStore({ activeSessionId: "ses_1" })
    const controller = createGatewayController({ opencode: {}, store })

    await expect(controller.setProgressVerbosity("verbose")).resolves.toEqual({
      progressVerbosity: "verbose",
    })

    expect(store.write).toHaveBeenCalledWith({ progressVerbosity: "verbose" })
    await expect(controller.getProgressVerbosity()).resolves.toBe("verbose")
  })

  test("rejects invalid progress verbosity", async () => {
    const store = createStore({ activeSessionId: "ses_1" })
    const controller = createGatewayController({ opencode: {}, store })

    await expect(controller.setProgressVerbosity("loud")).rejects.toThrow(/Invalid progress/)
    expect(store.write).not.toHaveBeenCalled()
  })

  test("sends prompt to active session", async () => {
    const store = createStore({ activeSessionId: "ses_1" })
    const opencode = {
      sendPrompt: vi.fn(async () => "answer"),
    }
    const controller = createGatewayController({ opencode, store })

    await expect(controller.sendPrompt("hello")).resolves.toBe("answer")
    expect(opencode.sendPrompt).toHaveBeenCalledWith("ses_1", "hello")
  })

  test("passes prompt progress options to OpenCode", async () => {
    const store = createStore({ activeSessionId: "ses_1" })
    const onProgress = vi.fn()
    const options = { onProgress }
    const opencode = {
      sendPrompt: vi.fn(async () => "answer"),
    }
    const controller = createGatewayController({ opencode, store })

    await expect(controller.sendPrompt("hello", options)).resolves.toBe("answer")

    expect(opencode.sendPrompt).toHaveBeenCalledWith("ses_1", "hello", options)
  })

  test("passes permission decisions to OpenCode", async () => {
    const store = createStore({ activeSessionId: "ses_1" })
    const opencode = {
      respondToPermission: vi.fn(async () => true),
    }
    const controller = createGatewayController({ opencode, store })

    await expect(controller.respondToPermission("ses_1", "perm_1", "always")).resolves.toBe(true)

    expect(opencode.respondToPermission).toHaveBeenCalledWith("ses_1", "perm_1", "always")
  })

  test("creates a session before first prompt when none is active", async () => {
    const store = createStore()
    const opencode = {
      createSession: vi.fn(async () => ({ id: "ses_2", title: "Auto" })),
      sendPrompt: vi.fn(async () => "answer"),
    }
    const controller = createGatewayController({ opencode, store })

    await expect(controller.sendPrompt("hello")).resolves.toBe("answer")
    expect(opencode.sendPrompt).toHaveBeenCalledWith("ses_2", "hello")
  })

  test("primes newly created sessions with gateway context before the first prompt", async () => {
    const calls = []
    const store = createStore()
    const opencode = {
      createSession: vi.fn(async () => {
        calls.push("create")
        return { id: "ses_2", title: "Auto" }
      }),
      sendContext: vi.fn(async () => {
        calls.push("context")
      }),
      sendPrompt: vi.fn(async () => {
        calls.push("prompt")
        return "answer"
      }),
    }
    const controller = createGatewayController({
      opencode,
      store,
      gatewayContext: "gateway context",
    })

    await expect(controller.sendPrompt("hello")).resolves.toBe("answer")

    expect(opencode.sendContext).toHaveBeenCalledWith("ses_2", "gateway context")
    expect(calls).toEqual(["create", "context", "prompt"])
  })

  test("does not prime existing selected sessions", async () => {
    const store = createStore({ activeSessionId: "ses_1" })
    const opencode = {
      sendContext: vi.fn(),
      sendPrompt: vi.fn(async () => "answer"),
    }
    const controller = createGatewayController({
      opencode,
      store,
      gatewayContext: "gateway context",
    })

    await expect(controller.sendPrompt("hello")).resolves.toBe("answer")

    expect(opencode.sendContext).not.toHaveBeenCalled()
    expect(opencode.sendPrompt).toHaveBeenCalledWith("ses_1", "hello")
  })

  test("continues sending the prompt when gateway context fails", async () => {
    const error = new Error("context failed")
    const logger = { warn: vi.fn() }
    const store = createStore()
    const opencode = {
      createSession: vi.fn(async () => ({ id: "ses_2", title: "Auto" })),
      sendContext: vi.fn(async () => {
        throw error
      }),
      sendPrompt: vi.fn(async () => "answer"),
    }
    const controller = createGatewayController({
      opencode,
      store,
      gatewayContext: "gateway context",
      logger,
    })

    await expect(controller.sendPrompt("hello")).resolves.toBe("answer")

    expect(opencode.sendPrompt).toHaveBeenCalledWith("ses_2", "hello")
    expect(logger.warn).toHaveBeenCalledWith(
      { error, sessionId: "ses_2" },
      "Could not send OpenCode gateway context",
    )
  })

  test("does not create a session when stopping without an active session", async () => {
    const store = createStore()
    const opencode = {
      createSession: vi.fn(),
      stopSession: vi.fn(),
    }
    const controller = createGatewayController({ opencode, store })

    await expect(controller.stop()).resolves.toEqual({
      stopped: false,
      reason: "no_active_session",
    })
    expect(opencode.createSession).not.toHaveBeenCalled()
    expect(opencode.stopSession).not.toHaveBeenCalled()
  })
})
