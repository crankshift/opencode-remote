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

  test("sends prompt to active session", async () => {
    const store = createStore({ activeSessionId: "ses_1" })
    const opencode = {
      sendPrompt: vi.fn(async () => "answer"),
    }
    const controller = createGatewayController({ opencode, store })

    await expect(controller.sendPrompt("hello")).resolves.toBe("answer")
    expect(opencode.sendPrompt).toHaveBeenCalledWith("ses_1", "hello")
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
