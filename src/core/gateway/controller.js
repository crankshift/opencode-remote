export function createGatewayController({ opencode, store }) {
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
    return session
  }

  return {
    async status() {
      const settings = await store.read()
      return {
        activeSessionId: settings.activeSessionId,
      }
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

    async sendPrompt(prompt) {
      const sessionId = await getActiveSessionId()
      return opencode.sendPrompt(sessionId, prompt)
    },

    async stop() {
      const sessionId = await getActiveSessionId()
      return opencode.stopSession(sessionId)
    },
  }
}
