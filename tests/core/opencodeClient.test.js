import { describe, expect, test, vi } from "vitest"
import { createOpenCodeClient } from "../../src/core/opencode/client.js"

describe("createOpenCodeClient", () => {
  test("sends text prompts with the current SDK prompt shape", async () => {
    const sdkClient = {
      session: {
        prompt: vi.fn(async () => ({ parts: [{ type: "text", text: "answer" }] })),
      },
    }
    const client = createOpenCodeClient({ sdkClient })

    await expect(client.sendPrompt("ses_1", "hello")).resolves.toBe("answer")
    expect(sdkClient.session.prompt).toHaveBeenCalledWith({
      path: { id: "ses_1" },
      body: {
        parts: [{ type: "text", text: "hello" }],
      },
    })
  })

  test("unwraps field-style SDK responses", async () => {
    const sdkClient = {
      session: {
        list: vi.fn(async () => ({ data: [{ id: "ses_1" }] })),
      },
    }
    const client = createOpenCodeClient({ sdkClient })

    await expect(client.listSessions()).resolves.toEqual([{ id: "ses_1" }])
  })
})
