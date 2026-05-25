import { describe, expect, test } from "vitest"
import { loadConfigFromEnv } from "../../src/config/loadConfig.js"

const REQUIRED_ENV = {
  TELEGRAM_BOT_TOKEN: "123:token",
  TELEGRAM_ALLOWED_USER_ID: "123",
}

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
    expect(config.progressVerbosity).toBe("all")
  })

  test("accepts false boolean for OpenCode auto-start", () => {
    const config = loadConfigFromEnv({
      TELEGRAM_BOT_TOKEN: "token",
      TELEGRAM_ALLOWED_USER_ID: "12345",
      OPENCODE_AUTO_START: "false",
    })

    expect(config.opencode.autoStart).toBe(false)
  })

  test("defaults progress verbosity to all", () => {
    const config = loadConfigFromEnv(REQUIRED_ENV)

    expect(config.progressVerbosity).toBe("all")
  })

  test("loads explicit progress verbosity", () => {
    const config = loadConfigFromEnv({
      ...REQUIRED_ENV,
      OPENCODE_PROGRESS_VERBOSITY: "off",
    })

    expect(config.progressVerbosity).toBe("off")
  })
})
