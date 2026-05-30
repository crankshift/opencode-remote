export const publicBotCommands = [
  { command: "status", description: "Show gateway and OpenCode status" },
  { command: "new", description: "Create and select a new OpenCode session" },
  { command: "sessions", description: "List and switch OpenCode sessions" },
  { command: "stop", description: "Abort current OpenCode task" },
  { command: "progress", description: "Set tool progress visibility" },
  { command: "voice", description: "Show or set voice mode and captions" },
  { command: "stickers", description: "Manage saved sticker packs" },
  { command: "skills", description: "Browse and create OpenCode skills" },
]

export const privateBotCommands = [
  ...publicBotCommands,
  { command: "group", description: "Manage Telegram group behavior" },
  { command: "help", description: "Show available commands" },
]

export const botCommands = privateBotCommands

export function renderHelpText() {
  return [
    "OpenCode Remote commands:",
    "",
    ...privateBotCommands.map((command) => `/${command.command} - ${command.description}`),
  ].join("\n")
}
