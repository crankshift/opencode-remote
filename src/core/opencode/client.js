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

    async sendPrompt(sessionId, prompt) {
      try {
        const response = toData(
          await client.session.prompt({
            path: { id: sessionId },
            body: {
              parts: [{ type: "text", text: prompt }],
            },
          }),
        )
        return extractText(response)
      } catch (error) {
        throw new GatewayOpenCodeError("Could not send prompt to OpenCode", error)
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
