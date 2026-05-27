import { PROGRESS_VERBOSITIES } from "../formatting/progressText.js"

export function createGatewayController({
  opencode,
  store,
  defaultProgressVerbosity = "all",
  gatewayContext = null,
  logger = null,
}) {
  const configuredProgressVerbosity = normalizeProgressVerbosity(defaultProgressVerbosity)

  async function getActiveSessionId() {
    const settings = await store.read()
    if (settings.activeSessionId) {
      return settings.activeSessionId
    }
    const session = await createSession()
    return session.id
  }

  async function createSession() {
    const session = await opencode.createSession()
    await store.write({ activeSessionId: session.id })
    await primeSession(session.id)
    return session
  }

  async function primeSession(sessionId) {
    if (!gatewayContext || typeof opencode.sendContext !== "function") {
      return
    }
    try {
      await opencode.sendContext(sessionId, gatewayContext)
    } catch (error) {
      logger?.warn?.({ error, sessionId }, "Could not send OpenCode gateway context")
    }
  }

  async function getProgressVerbosity() {
    const settings = await store.read()
    return normalizeProgressVerbosity(settings.progressVerbosity, configuredProgressVerbosity)
  }

  return {
    async status() {
      const settings = await store.read()
      return {
        activeSessionId: settings.activeSessionId,
        progressVerbosity: normalizeProgressVerbosity(
          settings.progressVerbosity,
          configuredProgressVerbosity,
        ),
      }
    },

    async getProgressVerbosity() {
      return getProgressVerbosity()
    },

    async setProgressVerbosity(progressVerbosity) {
      if (!PROGRESS_VERBOSITIES.includes(progressVerbosity)) {
        throw new Error(`Invalid progress verbosity: ${progressVerbosity}`)
      }
      await store.write({ progressVerbosity })
      return { progressVerbosity }
    },

    async createSession() {
      return createSession()
    },

    async listSessions() {
      return opencode.listSessions()
    },

    async selectSession(sessionId) {
      await store.write({ activeSessionId: sessionId })
      return { activeSessionId: sessionId }
    },

    async sendPrompt(prompt, options) {
      const sessionId = await getActiveSessionId()
      if (options === undefined) {
        return opencode.sendPrompt(sessionId, prompt)
      }
      return opencode.sendPrompt(sessionId, prompt, options)
    },

    async respondToPermission(sessionId, permissionId, decision) {
      return opencode.respondToPermission(sessionId, permissionId, decision)
    },

    async stop() {
      const settings = await store.read()
      if (!settings.activeSessionId) {
        return { stopped: false, reason: "no_active_session" }
      }
      const result = await opencode.stopSession(settings.activeSessionId)
      return { stopped: true, result }
    },
  }
}

function normalizeProgressVerbosity(value, fallback = "all") {
  if (PROGRESS_VERBOSITIES.includes(value)) {
    return value
  }
  if (PROGRESS_VERBOSITIES.includes(fallback)) {
    return fallback
  }
  return "all"
}
