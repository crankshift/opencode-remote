import { createOpencodeClient } from "@opencode-ai/sdk"

export class GatewayOpenCodeError extends Error {
  constructor(message, cause) {
    super(message)
    this.name = "GatewayOpenCodeError"
    this.cause = cause
  }
}

export function createOpenCodeClient({
  apiUrl,
  sdkClient = null,
  fetchImpl = globalThis.fetch,
} = {}) {
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
      const progressStream = await startPromptEventStream(client, sessionId, options)
      try {
        const response = toData(
          await client.session.prompt({
            path: { id: sessionId },
            body: toPromptBody(prompt),
          }),
        )
        return extractText(response)
      } catch (error) {
        throw new GatewayOpenCodeError("Could not send prompt to OpenCode", error)
      } finally {
        await progressStream.stop()
      }
    },

    async sendContext(sessionId, context) {
      try {
        return toData(
          await client.session.prompt({
            path: { id: sessionId },
            body: {
              noReply: true,
              parts: toPromptParts(context),
            },
          }),
        )
      } catch (error) {
        throw new GatewayOpenCodeError("Could not send OpenCode context", error)
      }
    },

    async respondToPermission(sessionId, permissionId, decision) {
      const body = toPermissionResponseBody(decision)
      try {
        if (typeof client.permission?.reply === "function") {
          return toData(
            await client.permission.reply({
              requestID: permissionId,
              reply: decision,
            }),
          )
        }
        if (typeof fetchImpl === "function" && apiUrl) {
          const currentResponse = await postCurrentPermissionReply({
            apiUrl,
            fetchImpl,
            permissionId,
            decision,
          })
          if (currentResponse.ok) {
            return currentResponse.data
          }
          if (!shouldFallbackToSessionPermissionResponse(currentResponse.status)) {
            throw new Error(`OpenCode permission API returned ${currentResponse.status}`)
          }
        }
        if (typeof client.postSessionIdPermissionsPermissionId === "function") {
          return toData(
            await client.postSessionIdPermissionsPermissionId({
              path: { id: sessionId, permissionID: permissionId },
              body,
            }),
          )
        }
        if (typeof fetchImpl !== "function" || !apiUrl) {
          throw new Error("OpenCode permission API is not available")
        }

        const response = await fetchImpl(
          `${apiUrl.replace(/\/$/u, "")}/session/${encodeURIComponent(sessionId)}/permissions/${encodeURIComponent(permissionId)}`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          },
        )
        if (!response.ok) {
          throw new Error(`OpenCode permission API returned ${response.status}`)
        }
        return response.json()
      } catch (error) {
        throw new GatewayOpenCodeError("Could not respond to OpenCode permission request", error)
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

async function startPromptEventStream(client, sessionId, options = {}) {
  const { onProgress, onSystemEvent } = options
  if (typeof onProgress !== "function" && typeof onSystemEvent !== "function") {
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
  let activeCallback = Promise.resolve()
  const done = (async () => {
    try {
      for await (const event of eventStream.stream) {
        if (stopped) {
          break
        }
        const progress = normalizeOpenCodeProgressEvent(event, sessionId)
        if (progress && typeof onProgress === "function") {
          activeCallback = runEventCallback(onProgress, progress)
          await activeCallback
        }

        const systemEvent = normalizeOpenCodeSystemEvent(event, sessionId)
        if (systemEvent && typeof onSystemEvent === "function") {
          activeCallback = runEventCallback(onSystemEvent, systemEvent)
          await activeCallback
        }
      }
    } catch {
      // Event streaming is best-effort for prompt progress.
    }
  })()

  return {
    async stop() {
      stopped = true
      eventStream.abort()
      await activeCallback
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

async function runEventCallback(callback, event) {
  try {
    await callback(event)
  } catch {
    // Progress is best-effort; prompt delivery should not depend on rendering.
  }
}

function noopProgressStream() {
  return { stop: async () => undefined }
}

function toPromptBody(prompt) {
  return { parts: toPromptParts(prompt) }
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

function normalizeOpenCodeSystemEvent(event, expectedSessionId) {
  return normalizeOpenCodePermissionEvent(event, expectedSessionId)
}

function normalizeOpenCodePermissionEvent(event, expectedSessionId) {
  if (event?.type !== "permission.updated" && event?.type !== "permission.asked") {
    return null
  }

  const properties = event.properties ?? {}
  const permission = properties.permission ?? properties.info ?? properties.request ?? properties
  const sessionId = firstString(
    permission.sessionID,
    permission.sessionId,
    properties.sessionID,
    properties.sessionId,
    permission.session?.id,
    properties.session?.id,
  )
  if (sessionId && sessionId !== expectedSessionId) {
    return null
  }

  const permissionId = firstString(
    permission.permissionID,
    permission.permissionId,
    permission.id,
    permission.requestID,
    properties.permissionID,
    properties.permissionId,
    properties.requestID,
    properties.id,
  )
  if (!permissionId) {
    return null
  }

  const metadata = permission.metadata ?? properties.metadata
  const systemEvent = {
    type: "permission.requested",
    sessionId: sessionId ?? expectedSessionId,
    permissionId,
    title: firstString(permission.title, properties.title) ?? "OpenCode permission request",
  }

  const description = firstString(
    permission.description,
    permission.message,
    properties.description,
    properties.message,
    formatPermissionPatterns(permission.patterns ?? properties.patterns),
  )
  if (description) {
    systemEvent.description = description
  }

  const tool = firstString(
    permission.tool,
    permission.toolName,
    permission.permission,
    properties.tool,
    properties.toolName,
    properties.permission,
  )
  if (tool) {
    systemEvent.tool = tool
  }
  if (metadata !== undefined) {
    systemEvent.metadata = metadata
  }
  return systemEvent
}

function formatPermissionPatterns(patterns) {
  if (!Array.isArray(patterns) || patterns.length === 0) {
    return undefined
  }
  return patterns.filter((pattern) => typeof pattern === "string" && pattern.trim()).join("\n")
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
    { type: "text", text: formatPromptText(prompt) },
  ]
}

function formatPromptText(prompt) {
  const text = String(prompt?.text ?? "")
  const author = normalizePromptAuthor(prompt?.author)
  if (!author) {
    return text
  }

  return [
    "Message author context:",
    `- Author: ${author.name}`,
    `- Attribution: ${formatAuthorAttribution(author.source)}`,
    "",
    "Message:",
    text,
  ].join("\n")
}

function normalizePromptAuthor(author) {
  if (!author || typeof author !== "object") {
    return null
  }
  const name = firstString(author.name)
  if (!name) {
    return null
  }
  return { name, source: firstString(author.source) ?? "sender" }
}

function formatAuthorAttribution(source) {
  if (source === "forwarded") {
    return "forwarded original author"
  }
  return "message sender"
}

function toData(result) {
  if (result && typeof result === "object" && "data" in result) {
    return result.data
  }
  return result
}

async function postCurrentPermissionReply({ apiUrl, fetchImpl, permissionId, decision }) {
  const response = await fetchImpl(
    `${apiUrl.replace(/\/$/u, "")}/permission/${encodeURIComponent(permissionId)}/reply`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reply: decision }),
    },
  )
  if (!response.ok) {
    return { ok: false, status: response.status }
  }
  return { ok: true, data: await readJsonResponse(response) }
}

function shouldFallbackToSessionPermissionResponse(status) {
  return status === 400 || status === 404 || status === 405
}

async function readJsonResponse(response) {
  if (typeof response.json !== "function") {
    return true
  }
  try {
    return await response.json()
  } catch {
    return true
  }
}

function toPermissionResponseBody(decision) {
  switch (decision) {
    case "once":
    case "always":
    case "reject":
      return { response: decision }
    default:
      throw new Error(`Invalid permission decision: ${decision}`)
  }
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
