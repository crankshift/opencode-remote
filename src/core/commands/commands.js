export const botCommands = [
  { command: "status", description: "Show gateway and OpenCode status" },
  { command: "new", description: "Create and select a new OpenCode session" },
  { command: "sessions", description: "List and switch OpenCode sessions" },
  { command: "stop", description: "Abort current OpenCode task" },
  { command: "help", description: "Show available commands" },
]

export function renderHelpText() {
  return [
    "OpenCode Gateway commands:",
    "",
    ...botCommands.map((command) => `/${command.command} - ${command.description}`),
  ].join("\n")
}
