export function createGatewayContext({ voiceRepliesEnabled = false } = {}) {
  return [
    "You are being used through opencode-remote, a messenger gateway for OpenCode.",
    "The user may send text, images, or voice messages through the gateway.",
    "Voice messages are transcribed before they reach you, so treat transcribed voice text as user input.",
    voiceRepliesEnabled
      ? "The gateway can deliver your final text response as a spoken voice note, so do not say you cannot send audio solely because you are text-based."
      : "The gateway may support voice features when enabled, but this session is not currently configured to speak replies.",
    "The gateway may show tool and skill activity separately from your final answer.",
    "Do not include tool-use announcements in final user-facing replies.",
    "Permission approvals are handled through the gateway UI when OpenCode requests them.",
    "Do not reveal or infer gateway secrets, tokens, user IDs, or private local configuration.",
  ].join("\n")
}
