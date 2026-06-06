import { describe, expect, test, vi } from "vitest"
import { createOpenCodeClient, GatewayOpenCodeError } from "../../src/core/opencode/client.js"

describe("createOpenCodeClient", () => {
  test("keeps prompt completion timeout out of the SDK client factory", () => {
    const sdkClient = { session: { list: vi.fn(async () => []) } }
    const sdkFactory = vi.fn(() => sdkClient)

    createOpenCodeClient({
      apiUrl: "http://localhost:4096",
      promptTimeoutMs: 1_800_000,
      sdkFactory,
    })

    expect(sdkFactory).toHaveBeenCalledWith({
      baseUrl: "http://localhost:4096",
      responseStyle: "data",
      throwOnError: true,
    })
  })

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

  test("does not pass callback-only or unsupported options in prompt body", async () => {
    const onProgress = vi.fn()
    const onSystemEvent = vi.fn()
    const sdkClient = {
      session: {
        prompt: vi.fn(async () => ({ parts: [{ type: "text", text: "answer" }] })),
      },
    }
    const client = createOpenCodeClient({ sdkClient })

    await expect(
      client.sendPrompt("ses_1", "hello", {
        onProgress,
        onSystemEvent,
        includeChildSessionEvents: true,
        ignored: "must not reach OpenCode",
      }),
    ).resolves.toBe("answer")

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

  test("adds messenger-neutral author context to object prompts", async () => {
    const sdkClient = {
      session: {
        prompt: vi.fn(async () => ({ parts: [{ type: "text", text: "answer" }] })),
      },
    }
    const client = createOpenCodeClient({ sdkClient })

    await expect(
      client.sendPrompt("ses_1", {
        text: "please summarize this",
        author: { name: "Ada Lovelace", source: "forwarded" },
      }),
    ).resolves.toBe("answer")

    expect(sdkClient.session.prompt).toHaveBeenCalledWith({
      path: { id: "ses_1" },
      body: {
        parts: [
          {
            type: "text",
            text: [
              "Message author context:",
              "- Author: Ada Lovelace",
              "- Attribution: forwarded original author",
              "",
              "Message:",
              "please summarize this",
            ].join("\n"),
          },
        ],
      },
    })
  })

  test("keeps attachments before author-context text prompts", async () => {
    const sdkClient = {
      session: {
        prompt: vi.fn(async () => ({ parts: [{ type: "text", text: "answer" }] })),
      },
    }
    const client = createOpenCodeClient({ sdkClient })

    await expect(
      client.sendPrompt("ses_1", {
        text: "What changed?",
        author: { name: "Grace Hopper", source: "sender" },
        attachments: [{ mime: "image/jpeg", url: "file:///tmp/photo.jpg" }],
      }),
    ).resolves.toBe("answer")

    expect(sdkClient.session.prompt).toHaveBeenCalledWith({
      path: { id: "ses_1" },
      body: {
        parts: [
          { type: "file", mime: "image/jpeg", url: "file:///tmp/photo.jpg" },
          {
            type: "text",
            text: [
              "Message author context:",
              "- Author: Grace Hopper",
              "- Attribution: message sender",
              "",
              "Message:",
              "What changed?",
            ].join("\n"),
          },
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

  test("resolves async prompts from the matching completed assistant message", async () => {
    const stream = createControlledEventStream()
    const sdkClient = {
      event: { list: vi.fn(async () => stream) },
      session: {
        promptAsync: vi.fn(async (request) => {
          const userMessageId = request.body.messageID
          queueMicrotask(() => {
            stream.push({
              type: "message.part.updated",
              properties: {
                part: {
                  id: "part_text",
                  sessionID: "ses_1",
                  messageID: "msg_assistant",
                  type: "text",
                  text: "research result",
                },
              },
            })
            stream.push({
              type: "message.updated",
              properties: {
                info: {
                  id: "msg_assistant",
                  sessionID: "ses_1",
                  role: "assistant",
                  parentID: userMessageId,
                  time: { created: 1, completed: 2 },
                },
              },
            })
          })
        }),
      },
    }
    const client = createOpenCodeClient({ sdkClient })

    await expect(client.sendPrompt("ses_1", "research task")).resolves.toBe("research result")

    expect(sdkClient.session.promptAsync).toHaveBeenCalledWith({
      path: { id: "ses_1" },
      body: {
        messageID: expect.any(String),
        parts: [{ type: "text", text: "research task" }],
      },
    })
    expect(stream.controller.abort).toHaveBeenCalled()
  })

  test("times out async prompts when completion is not observed", async () => {
    vi.useFakeTimers()
    const stream = createControlledEventStream()
    const sdkClient = {
      event: { list: vi.fn(async () => stream) },
      session: {
        promptAsync: vi.fn(async () => undefined),
      },
    }
    const client = createOpenCodeClient({ sdkClient, promptTimeoutMs: 10 })

    try {
      const prompt = client.sendPrompt("ses_1", "research task").catch((error) => error)
      await vi.advanceTimersByTimeAsync(10)
      const result = await Promise.race([prompt, Promise.resolve("still waiting")])

      expect(result).toBeInstanceOf(GatewayOpenCodeError)
      expect(result.message).toBe("Could not send prompt to OpenCode")
      expect(result.cause.message).toBe("OpenCode prompt did not complete before timeout")
    } finally {
      stream.controller.abort()
      vi.useRealTimers()
    }
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

  test("streams normalized current permission asked events while a prompt is running", async () => {
    const stream = createEventStream([
      {
        type: "permission.asked",
        properties: {
          id: "perm_1",
          sessionID: "ses_1",
          permission: "bash",
          patterns: ["ls /tmp"],
          metadata: { command: "ls /tmp" },
          tool: { messageID: "msg_1", callID: "call_1" },
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
      title: "OpenCode permission request",
      description: "ls /tmp",
      tool: "bash",
      metadata: { command: "ls /tmp" },
    })
  })

  test("streams child session permission requests when child events are enabled", async () => {
    const stream = createEventStream([
      {
        type: "permission.asked",
        properties: {
          id: "perm_child",
          sessionID: "ses_child",
          permission: "bash",
          patterns: ["pnpm test"],
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

    await expect(
      client.sendPrompt("ses_parent", "hello", {
        onSystemEvent,
        includeChildSessionEvents: true,
      }),
    ).resolves.toBe("answer")

    expect(onSystemEvent).toHaveBeenCalledWith({
      type: "permission.requested",
      sessionId: "ses_child",
      parentSessionId: "ses_parent",
      childSession: true,
      permissionId: "perm_child",
      title: "OpenCode permission request",
      description: "pnpm test",
      tool: "bash",
      metadata: { command: "pnpm test" },
    })
  })

  test("streams child session tool progress when child events are enabled", async () => {
    const stream = createEventStream([
      {
        type: "message.part.updated",
        properties: {
          part: {
            id: "part_child",
            messageID: "msg_child",
            sessionID: "ses_child",
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
      event: { list: vi.fn(async () => stream) },
      session: {
        prompt: vi.fn(async () => {
          await new Promise((resolve) => setTimeout(resolve, 0))
          return { parts: [{ type: "text", text: "answer" }] }
        }),
      },
    }
    const client = createOpenCodeClient({ sdkClient })

    await expect(
      client.sendPrompt("ses_parent", "hello", {
        onProgress,
        includeChildSessionEvents: true,
      }),
    ).resolves.toBe("answer")

    expect(onProgress).toHaveBeenCalledWith({
      type: "tool.updated",
      sessionId: "ses_child",
      parentSessionId: "ses_parent",
      childSession: true,
      messageId: "msg_child",
      partId: "part_child",
      tool: "bash",
      title: undefined,
      status: "running",
      input: { command: "pnpm test" },
    })
  })

  test("streams safe child session errors when child events are enabled", async () => {
    const stream = createEventStream([
      {
        type: "session.error",
        properties: {
          sessionID: "ses_child",
          error: {
            name: "ProviderAuthError",
            message: "secret provider payload must not be forwarded",
            body: { token: "secret" },
          },
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

    await expect(
      client.sendPrompt("ses_parent", "hello", {
        onSystemEvent,
        includeChildSessionEvents: true,
      }),
    ).resolves.toBe("answer")

    expect(onSystemEvent).toHaveBeenCalledWith({
      type: "session.error",
      sessionId: "ses_child",
      parentSessionId: "ses_parent",
      childSession: true,
      errorName: "ProviderAuthError",
      errorKind: "provider_auth",
    })
    expect(JSON.stringify(onSystemEvent.mock.calls)).not.toContain("secret provider payload")
    expect(JSON.stringify(onSystemEvent.mock.calls)).not.toContain("token")
  })

  test("responds to permission requests with the current OpenCode SDK payload", async () => {
    const sdkClient = {
      postSessionIdPermissionsPermissionId: vi.fn(async () => true),
    }
    const client = createOpenCodeClient({ sdkClient })

    await expect(client.respondToPermission("ses_1", "perm_1", "always")).resolves.toBe(true)

    expect(sdkClient.postSessionIdPermissionsPermissionId).toHaveBeenCalledWith({
      path: { id: "ses_1", permissionID: "perm_1" },
      body: { response: "always" },
    })
  })

  test("responds to permission asked requests with the current request reply endpoint", async () => {
    const sdkClient = {
      postSessionIdPermissionsPermissionId: vi.fn(async () => true),
    }
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => true }))
    const client = createOpenCodeClient({
      apiUrl: "http://localhost:4096",
      sdkClient,
      fetchImpl,
    })

    await expect(client.respondToPermission("ses_1", "request_1", "once")).resolves.toBe(true)

    expect(fetchImpl).toHaveBeenCalledWith("http://localhost:4096/permission/request_1/reply", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reply: "once" }),
    })
    expect(sdkClient.postSessionIdPermissionsPermissionId).not.toHaveBeenCalled()
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

function createControlledEventStream() {
  const events = []
  let wake = null
  let aborted = false
  const stream = (async function* streamEvents() {
    while (!aborted) {
      if (events.length === 0) {
        await new Promise((resolve) => {
          wake = resolve
        })
      }
      while (events.length > 0) {
        yield events.shift()
      }
    }
  })()
  stream.controller = {
    abort: vi.fn(() => {
      aborted = true
      wake?.()
    }),
  }
  stream.push = (event) => {
    events.push(event)
    wake?.()
    wake = null
  }
  return stream
}
