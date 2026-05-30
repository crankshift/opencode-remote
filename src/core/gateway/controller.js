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
      logger?.debug?.({ hasActiveSession: true }, "Using active OpenCode session")
      return settings.activeSessionId
    }
    logger?.debug?.({ hasActiveSession: false }, "No active OpenCode session selected")
    const session = await createSession()
    return session.id
  }

  async function createSession(options = {}) {
    logger?.debug?.(
      {
        hasAdditionalContext: Boolean(options.context),
        hasGatewayContext: Boolean(gatewayContext),
      },
      "Creating OpenCode session",
    )
    const session = await opencode.createSession()
    await store.write({ activeSessionId: session.id })
    await primeSession(session.id, options.context)
    logger?.debug?.({ hasAdditionalContext: Boolean(options.context) }, "OpenCode session selected")
    return session
  }

  async function primeSession(sessionId, additionalContext) {
    if ((!gatewayContext && !additionalContext) || typeof opencode.sendContext !== "function") {
      return
    }
    const context = [gatewayContext, additionalContext].filter(Boolean).join("\n\n")
    try {
      await opencode.sendContext(sessionId, context)
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

    async createSession(options) {
      return createSession(options)
    },

    async listSessions() {
      return opencode.listSessions()
    },

    async selectSession(sessionId) {
      await store.write({ activeSessionId: sessionId })
      logger?.debug?.({ selected: true }, "OpenCode session selected")
      return { activeSessionId: sessionId }
    },

    async sendPrompt(prompt, options) {
      const sessionId = await getActiveSessionId()
      logger?.debug?.(
        {
          hasOptions: options !== undefined,
          hasProgressHandler: typeof options?.onProgress === "function",
          promptKind: typeof prompt,
        },
        "Sending prompt to OpenCode",
      )
      if (options === undefined) {
        return opencode.sendPrompt(sessionId, prompt)
      }
      return opencode.sendPrompt(sessionId, prompt, options)
    },

    async respondToPermission(sessionId, permissionId, decision) {
      logger?.debug?.({ decision }, "Responding to OpenCode permission request")
      return opencode.respondToPermission(sessionId, permissionId, decision)
    },

    async stop() {
      const settings = await store.read()
      if (!settings.activeSessionId) {
        logger?.debug?.({ hasActiveSession: false }, "No active OpenCode session to stop")
        return { stopped: false, reason: "no_active_session" }
      }
      logger?.debug?.({ hasActiveSession: true }, "Stopping active OpenCode session")
      const result = await opencode.stopSession(settings.activeSessionId)
      logger?.debug?.({ stopped: true }, "OpenCode stop requested")
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
