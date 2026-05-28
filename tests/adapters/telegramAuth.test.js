import { describe, expect, test } from "vitest"
import { isAuthorizedTelegramUser } from "../../src/adapters/telegram/auth.js"

describe("isAuthorizedTelegramUser", () => {
  test("allows configured direct users in private chats", () => {
    expect(
      isAuthorizedTelegramUser(
        { from: { id: 123, is_bot: false }, chat: { id: 123, type: "private" } },
        { allowedUserIds: [123], allowedChatIds: [] },
      ),
    ).toBe(true)
  })

  test("rejects other direct users in private chats", () => {
    expect(
      isAuthorizedTelegramUser(
        { from: { id: 999, is_bot: false }, chat: { id: 999, type: "private" } },
        { allowedUserIds: [123], allowedChatIds: [] },
      ),
    ).toBe(false)
  })

  test("allows any sender in configured group chats", () => {
    expect(
      isAuthorizedTelegramUser(
        { from: { id: 999, is_bot: true }, chat: { id: -1001, type: "supergroup" } },
        { allowedUserIds: [], allowedChatIds: [-1001] },
      ),
    ).toBe(true)
  })

  test("rejects updates without a sender", () => {
    expect(isAuthorizedTelegramUser({}, { allowedUserIds: [123], allowedChatIds: [] })).toBe(false)
  })
})
