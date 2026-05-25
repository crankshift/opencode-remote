import { createOpencodeClient } from "@opencode-ai/sdk"

export class GatewayOpenCodeError extends Error {
  constructor(message, cause) {
    super(message)
    this.name = "GatewayOpenCodeError"
    this.cause = cause
  }
}

export function createOpenCodeClient({ apiUrl, sdkClient = null } = {}) {
  const client =
    sdkClient ??
    createOpencodeClient({
      baseUrl: apiUrl,
      responseStyle: "data",
      throwOnError: true,
    })

  return {
    async listSessions() {
      try {
        return toData(await client.session.list())
      } catch (error) {
        throw new GatewayOpenCodeError("Could not list OpenCode sessions", error)
      }
    },

    async createSession() {
      try {
        return toData(await client.session.create())
      } catch (error) {
        throw new GatewayOpenCodeError("Could not create OpenCode session", error)
      }
    },

    async sendPrompt(sessionId, prompt, options = {}) {
      const progressStream = await startPromptProgressStream(client, sessionId, options.onProgress)
      try {
        const response = toData(
          await client.session.prompt({
            path: { id: sessionId },
            body: {
              parts: toPromptParts(prompt),
            },
          }),
        )
        return extractText(response)
      } catch (error) {
        throw new GatewayOpenCodeError("Could not send prompt to OpenCode", error)
      } finally {
        await progressStream.stop()
      }
    },

    async stopSession(sessionId) {
      try {
        return toData(
          await client.session.abort({
            path: { id: sessionId },
          }),
        )
      } catch (error) {
        throw new GatewayOpenCodeError("Could not stop OpenCode session", error)
      }
    },
  }
}

async function startPromptProgressStream(client, sessionId, onProgress) {
  if (typeof onProgress !== "function") {
    return noopProgressStream()
  }

  let eventStream
  try {
    eventStream = await openEventStream(client)
  } catch {
    return noopProgressStream()
  }
  if (!eventStream) {
    return noopProgressStream()
  }

  let stopped = false
  let activeProgress = Promise.resolve()
  const done = (async () => {
    try {
      for await (const event of eventStream.stream) {
        if (stopped) {
          break
        }
        const progress = normalizeOpenCodeProgressEvent(event, sessionId)
        if (!progress) {
          continue
        }
        activeProgress = runProgressCallback(onProgress, progress)
        await activeProgress
      }
    } catch {
      // Event streaming is best-effort for prompt progress.
    }
  })()

  return {
    async stop() {
      stopped = true
      eventStream.abort()
      await activeProgress
      await Promise.race([done, Promise.resolve()])
    },
  }
}

async function openEventStream(client) {
  if (typeof client.event?.subscribe === "function") {
    try {
      const controller = new AbortController()
      const result = await client.event.subscribe({ signal: controller.signal })
      const stream = result?.stream ?? result
      if (stream) {
        return {
          stream,
          abort: () => controller.abort(),
        }
      }
    } catch {
      // Older SDK/server combinations may expose subscribe but only support list.
    }
  }

  if (typeof client.event?.list === "function") {
    const stream = await client.event.list()
    return {
      stream,
      abort: () => stream?.controller?.abort?.(),
    }
  }

  return null
}

async function runProgressCallback(onProgress, progress) {
  try {
    await onProgress(progress)
  } catch {
    // Progress is best-effort; prompt delivery should not depend on rendering.
  }
}

function noopProgressStream() {
  return { stop: async () => undefined }
}

function normalizeOpenCodeProgressEvent(event, expectedSessionId) {
  if (event?.type !== "message.part.updated") {
    return null
  }

  const part = event.properties?.part
  if (part?.type !== "tool") {
    return null
  }

  const sessionId = firstString(part.sessionID, part.sessionId, event.properties?.sessionID)
  if (!sessionId || sessionId !== expectedSessionId) {
    return null
  }

  const tool = firstString(part.tool, part.toolName, part.name)
  if (!tool) {
    return null
  }

  const input = part.input ?? part.state?.input ?? part.state?.args ?? part.args
  const metadata = part.metadata ?? part.state?.metadata

  const progress = {
    type: "tool.updated",
    sessionId,
    messageId: firstString(part.messageID, part.messageId, event.properties?.messageID),
    partId: firstString(part.id, part.partID, part.partId),
    tool,
    title: extractToolTitle(part, input, metadata, tool),
    status: firstString(part.state?.status, part.status),
    input,
  }
  if (metadata !== undefined) {
    progress.metadata = metadata
  }
  return progress
}

function extractToolTitle(part, input, metadata, tool) {
  return (
    firstString(
      part.title,
      part.state?.title,
      metadata?.title,
      metadata?.skill,
      metadata?.skillName,
      metadata?.skill_name,
      metadata?.name,
      input?.skill,
      input?.skillName,
      input?.skill_name,
      input?.name,
      part.state?.input?.skill,
      part.state?.input?.skillName,
      part.state?.input?.skill_name,
      part.state?.input?.name,
    ) ?? titleFromSkillTool(tool)
  )
}

function titleFromSkillTool(tool) {
  if (typeof tool !== "string" || !tool.startsWith("skills_")) {
    return undefined
  }
  const title = tool.slice("skills_".length).replaceAll("_", "-")
  return title || undefined
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim()
    }
  }
  return undefined
}

function toPromptParts(prompt) {
  if (typeof prompt === "string") {
    return [{ type: "text", text: prompt }]
  }

  const attachments = Array.isArray(prompt?.attachments) ? prompt.attachments : []
  return [
    ...attachments.map((attachment) => ({
      type: "file",
      mime: attachment.mime,
      url: attachment.url,
    })),
    { type: "text", text: String(prompt?.text ?? "") },
  ]
}

function toData(result) {
  if (result && typeof result === "object" && "data" in result) {
    return result.data
  }
  return result
}

function extractText(response) {
  if (typeof response === "string") {
    return response
  }
  const parts = response?.parts ?? []
  const text = parts
    .map((part) => {
      if (part.type === "text" && typeof part.text === "string") {
        return part.text
      }
      if (part.type === "text" && typeof part.content === "string") {
        return part.content
      }
      return null
    })
    .filter(Boolean)
    .join("\n")
  return text || "OpenCode returned no text response."
}
