import { describe, expect, test } from "vitest"
import { isAuthorizedTelegramUser } from "../../src/adapters/telegram/auth.js"

describe("isAuthorizedTelegramUser", () => {
  test("allows the configured Telegram user ID", () => {
    expect(isAuthorizedTelegramUser({ from: { id: 123 } }, 123)).toBe(true)
  })

  test("rejects other Telegram user IDs", () => {
    expect(isAuthorizedTelegramUser({ from: { id: 999 } }, 123)).toBe(false)
  })

  test("rejects updates without a sender", () => {
    expect(isAuthorizedTelegramUser({}, 123)).toBe(false)
  })
})
