import { describe, expect, test } from "vitest"
import { createGatewayContext } from "../../src/core/gateway/context.js"

describe("createGatewayContext", () => {
  test("describes voice reply capability without Telegram-specific wording", () => {
    const context = createGatewayContext({ voiceRepliesEnabled: true })

    expect(context).toContain("spoken voice note")
    expect(context).toContain("transcribed before they reach you")
    expect(context).toContain("Permission approvals are handled through the gateway UI")
    expect(context).not.toContain("Telegram")
  })

  test("describes disabled voice replies without claiming the gateway cannot handle voice input", () => {
    const context = createGatewayContext({ voiceRepliesEnabled: false })

    expect(context).toContain("not currently configured to speak replies")
    expect(context).toContain("Voice messages are transcribed")
  })
})
