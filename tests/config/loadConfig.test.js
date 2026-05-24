import { describe, expect, test } from "vitest"
import { loadConfigFromEnv } from "../../src/config/loadConfig.js"

describe("loadConfigFromEnv", () => {
  test("requires Telegram token and allowed user ID", () => {
    expect(() => loadConfigFromEnv({})).toThrow(/TELEGRAM_BOT_TOKEN/)
  })

  test("parses defaults and numeric Telegram user ID", () => {
    const config = loadConfigFromEnv({
      TELEGRAM_BOT_TOKEN: "token",
      TELEGRAM_ALLOWED_USER_ID: "12345",
    })

    expect(config.telegram.botToken).toBe("token")
    expect(config.telegram.allowedUserId).toBe(12345)
    expect(config.opencode.apiUrl).toBe("http://localhost:4096")
    expect(config.opencode.autoStart).toBe(true)
    expect(config.settingsPath).toBe(".data/settings.json")
  })

  test("accepts false boolean for OpenCode auto-start", () => {
    const config = loadConfigFromEnv({
      TELEGRAM_BOT_TOKEN: "token",
      TELEGRAM_ALLOWED_USER_ID: "12345",
      OPENCODE_AUTO_START: "false",
    })

    expect(config.opencode.autoStart).toBe(false)
  })
})
