import { describe, expect, test } from "vitest"
import { botCommands, renderHelpText } from "../../src/core/commands/commands.js"

describe("commands", () => {
  test("defines the v1 command surface", () => {
    expect(botCommands.map((command) => command.command)).toEqual([
      "status",
      "new",
      "sessions",
      "stop",
      "progress",
      "voice",
      "stickers",
      "skills",
      "group",
      "help",
    ])
  })

  test("renders help from centralized command definitions", () => {
    const help = renderHelpText()

    expect(help).toContain("/status - Show gateway and OpenCode status")
    expect(help).toContain("/sessions - List and switch OpenCode sessions")
    expect(help).toContain("/progress - Set tool progress visibility")
    expect(help).toContain("/voice - Show or set voice mode and captions")
    expect(help).toContain("/stickers - Manage saved sticker packs")
    expect(help).toContain("/skills - Browse and create OpenCode skills")
    expect(help).toContain("/group - Manage Telegram group behavior")
  })
})
