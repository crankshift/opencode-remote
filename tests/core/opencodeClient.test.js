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

  test("sends context prompts without requesting an assistant reply", async () => {
    const sdkClient = {
      session: {
        prompt: vi.fn(async () => ({ id: "msg_1" })),
      },
    }
    const client = createOpenCodeClient({ sdkClient })

    await expect(client.sendContext("ses_1", "gateway context")).resolves.toEqual({ id: "msg_1" })

    expect(sdkClient.session.prompt).toHaveBeenCalledWith({
      path: { id: "ses_1" },
      body: {
        noReply: true,
        parts: [{ type: "text", text: "gateway context" }],
      },
    })
  })

  test("sends prompt attachments as file parts before the text part", async () => {
    const sdkClient = {
      session: {
        prompt: vi.fn(async () => ({ parts: [{ type: "text", text: "answer" }] })),
      },
    }
    const client = createOpenCodeClient({ sdkClient })

    await expect(
      client.sendPrompt("ses_1", {
        text: "What is in these images?",
        attachments: [
          { mime: "image/jpeg", url: "file:///tmp/photo-1.jpg" },
          { mime: "image/png", url: "file:///tmp/photo-2.png" },
        ],
      }),
    ).resolves.toBe("answer")

    expect(sdkClient.session.prompt).toHaveBeenCalledWith({
      path: { id: "ses_1" },
      body: {
        parts: [
          { type: "file", mime: "image/jpeg", url: "file:///tmp/photo-1.jpg" },
          { type: "file", mime: "image/png", url: "file:///tmp/photo-2.png" },
          { type: "text", text: "What is in these images?" },
        ],
      },
    })
  })

  test("streams normalized skill progress while a prompt is running", async () => {
    const stream = createEventStream([
      {
        type: "message.part.updated",
        properties: {
          part: {
            id: "part_1",
            messageID: "msg_1",
            sessionID: "ses_1",
            type: "tool",
            tool: "skill_view",
            state: {
              status: "running",
              input: { skill: "brainstorming" },
            },
          },
        },
      },
    ])
    const onProgress = vi.fn()
    const sdkClient = {
      event: { list: vi.fn(async () => stream) },
      session: {
        prompt: vi.fn(async () => {
          await new Promise((resolve) => setTimeout(resolve, 0))
          return { parts: [{ type: "text", text: "answer" }] }
        }),
      },
    }
    const client = createOpenCodeClient({ sdkClient })

    await expect(client.sendPrompt("ses_1", "hello", { onProgress })).resolves.toBe("answer")

    expect(sdkClient.event.list).toHaveBeenCalled()
    expect(onProgress).toHaveBeenCalledWith({
      type: "tool.updated",
      sessionId: "ses_1",
      messageId: "msg_1",
      partId: "part_1",
      tool: "skill_view",
      title: "brainstorming",
      status: "running",
      input: { skill: "brainstorming" },
    })
    expect(stream.controller.abort).toHaveBeenCalled()
  })

  test("uses current SDK event.subscribe stream shape for progress", async () => {
    let subscribeSignal
    const stream = createEventStream([
      {
        type: "message.part.updated",
        properties: {
          part: {
            id: "part_1",
            messageID: "msg_1",
            sessionID: "ses_1",
            type: "tool",
            tool: "bash",
            state: {
              status: "running",
              input: { command: "pnpm test" },
            },
          },
        },
      },
    ])
    const onProgress = vi.fn()
    const sdkClient = {
      event: {
        subscribe: vi.fn(async (options) => {
          subscribeSignal = options.signal
          return { stream }
        }),
      },
      session: {
        prompt: vi.fn(async () => {
          await new Promise((resolve) => setTimeout(resolve, 0))
          return { parts: [{ type: "text", text: "answer" }] }
        }),
      },
    }
    const client = createOpenCodeClient({ sdkClient })

    await expect(client.sendPrompt("ses_1", "hello", { onProgress })).resolves.toBe("answer")

    expect(sdkClient.event.subscribe).toHaveBeenCalledWith({ signal: expect.any(AbortSignal) })
    expect(onProgress).toHaveBeenCalledWith({
      type: "tool.updated",
      sessionId: "ses_1",
      messageId: "msg_1",
      partId: "part_1",
      tool: "bash",
      title: undefined,
      status: "running",
      input: { command: "pnpm test" },
    })
    expect(subscribeSignal.aborted).toBe(true)
  })

  test("streams normalized permission requests while a prompt is running", async () => {
    const stream = createEventStream([
      {
        type: "permission.updated",
        properties: {
          sessionID: "ses_1",
          permissionID: "perm_1",
          title: "Run shell command",
          description: "pnpm test",
          tool: "bash",
          metadata: { command: "pnpm test" },
        },
      },
    ])
    const onSystemEvent = vi.fn()
    const sdkClient = {
      event: { list: vi.fn(async () => stream) },
      session: {
        prompt: vi.fn(async () => {
          await new Promise((resolve) => setTimeout(resolve, 0))
          return { parts: [{ type: "text", text: "answer" }] }
        }),
      },
    }
    const client = createOpenCodeClient({ sdkClient })

    await expect(client.sendPrompt("ses_1", "hello", { onSystemEvent })).resolves.toBe("answer")

    expect(onSystemEvent).toHaveBeenCalledWith({
      type: "permission.requested",
      sessionId: "ses_1",
      permissionId: "perm_1",
      title: "Run shell command",
      description: "pnpm test",
      tool: "bash",
      metadata: { command: "pnpm test" },
    })
  })

  test("responds to permission requests with OpenCode API payloads", async () => {
    const sdkClient = {
      postSessionByIdPermissionsByPermissionId: vi.fn(async () => true),
    }
    const client = createOpenCodeClient({ sdkClient })

    await expect(client.respondToPermission("ses_1", "perm_1", "always")).resolves.toBe(true)

    expect(sdkClient.postSessionByIdPermissionsByPermissionId).toHaveBeenCalledWith({
      path: { id: "ses_1", permissionId: "perm_1" },
      body: { response: "accept", remember: true },
    })
  })

  test("falls back to event.list when event.subscribe fails", async () => {
    const stream = createEventStream([
      {
        type: "message.part.updated",
        properties: {
          part: {
            id: "part_1",
            messageID: "msg_1",
            sessionID: "ses_1",
            type: "tool",
            tool: "bash",
            state: {
              status: "running",
              input: { command: "pnpm test" },
            },
          },
        },
      },
    ])
    const onProgress = vi.fn()
    const sdkClient = {
      event: {
        subscribe: vi.fn(async () => {
          throw new Error("subscribe unsupported")
        }),
        list: vi.fn(async () => stream),
      },
      session: {
        prompt: vi.fn(async () => {
          await new Promise((resolve) => setTimeout(resolve, 0))
          return { parts: [{ type: "text", text: "answer" }] }
        }),
      },
    }
    const client = createOpenCodeClient({ sdkClient })

    await expect(client.sendPrompt("ses_1", "hello", { onProgress })).resolves.toBe("answer")

    expect(sdkClient.event.subscribe).toHaveBeenCalled()
    expect(sdkClient.event.list).toHaveBeenCalled()
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "ses_1",
        tool: "bash",
        input: { command: "pnpm test" },
      }),
    )
  })

  test("extracts skill name from tool metadata when input is empty", async () => {
    const stream = createEventStream([
      {
        type: "message.part.updated",
        properties: {
          part: {
            id: "part_1",
            messageID: "msg_1",
            sessionID: "ses_1",
            type: "tool",
            tool: "skill",
            state: {
              status: "running",
              input: {},
              metadata: { name: "brainstorming" },
            },
          },
        },
      },
    ])
    const onProgress = vi.fn()
    const sdkClient = {
      event: { list: vi.fn(async () => stream) },
      session: {
        prompt: vi.fn(async () => {
          await new Promise((resolve) => setTimeout(resolve, 0))
          return { parts: [{ type: "text", text: "answer" }] }
        }),
      },
    }
    const client = createOpenCodeClient({ sdkClient })

    await expect(client.sendPrompt("ses_1", "hello", { onProgress })).resolves.toBe("answer")

    expect(onProgress).toHaveBeenCalledWith({
      type: "tool.updated",
      sessionId: "ses_1",
      messageId: "msg_1",
      partId: "part_1",
      tool: "skill",
      title: "brainstorming",
      status: "running",
      input: {},
      metadata: { name: "brainstorming" },
    })
  })

  test("extracts skill name from generated skill tool names", async () => {
    const stream = createEventStream([
      {
        type: "message.part.updated",
        properties: {
          part: {
            id: "part_1",
            messageID: "msg_1",
            sessionID: "ses_1",
            type: "tool",
            tool: "skills_brand_guidelines",
            state: { status: "running", input: {} },
          },
        },
      },
    ])
    const onProgress = vi.fn()
    const sdkClient = {
      event: { list: vi.fn(async () => stream) },
      session: {
        prompt: vi.fn(async () => {
          await new Promise((resolve) => setTimeout(resolve, 0))
          return { parts: [{ type: "text", text: "answer" }] }
        }),
      },
    }
    const client = createOpenCodeClient({ sdkClient })

    await expect(client.sendPrompt("ses_1", "hello", { onProgress })).resolves.toBe("answer")

    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        tool: "skills_brand_guidelines",
        title: "brand-guidelines",
      }),
    )
  })

  test("ignores progress events from other sessions", async () => {
    const stream = createEventStream([
      {
        type: "message.part.updated",
        properties: {
          part: {
            id: "part_1",
            messageID: "msg_1",
            sessionID: "ses_other",
            type: "tool",
            tool: "bash",
            state: { status: "running" },
          },
        },
      },
    ])
    const sdkClient = {
      event: { list: vi.fn(async () => stream) },
      session: {
        prompt: vi.fn(async () => {
          await new Promise((resolve) => setTimeout(resolve, 0))
          return { parts: [{ type: "text", text: "answer" }] }
        }),
      },
    }
    const onProgress = vi.fn()
    const client = createOpenCodeClient({ sdkClient })

    await expect(client.sendPrompt("ses_1", "hello", { onProgress })).resolves.toBe("answer")

    expect(onProgress).not.toHaveBeenCalled()
  })

  test("waits for an in-flight progress callback before resolving the prompt", async () => {
    let releaseProgress
    const progressBlocker = new Promise((resolve) => {
      releaseProgress = resolve
    })
    const stream = createEventStream([
      {
        type: "message.part.updated",
        properties: {
          part: {
            id: "part_1",
            messageID: "msg_1",
            sessionID: "ses_1",
            type: "tool",
            tool: "bash",
            state: { status: "running" },
          },
        },
      },
    ])
    const sdkClient = {
      event: { list: vi.fn(async () => stream) },
      session: {
        prompt: vi.fn(async () => {
          await new Promise((resolve) => setTimeout(resolve, 0))
          return { parts: [{ type: "text", text: "answer" }] }
        }),
      },
    }
    const client = createOpenCodeClient({ sdkClient })
    let resolved = false

    const prompt = client
      .sendPrompt("ses_1", "hello", {
        onProgress: async () => {
          await progressBlocker
        },
      })
      .then((result) => {
        resolved = true
        return result
      })

    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(resolved).toBe(false)

    releaseProgress()
    await expect(prompt).resolves.toBe("answer")
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

function createEventStream(events) {
  const stream = (async function* streamEvents() {
    for (const event of events) {
      yield event
    }
  })()
  stream.controller = { abort: vi.fn() }
  return stream
}
