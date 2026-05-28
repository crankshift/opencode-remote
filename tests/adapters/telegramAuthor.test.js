import { describe, expect, test } from "vitest"
import { authorContextFromTelegramMessage } from "../../src/adapters/telegram/author.js"

describe("telegram author context", () => {
  test("uses the known forwarded user as the forwarded author", () => {
    const author = authorContextFromTelegramMessage({
      from: { id: 123, is_bot: false, first_name: "Forwarder" },
      forward_origin: {
        type: "user",
        sender_user: {
          id: 999,
          is_bot: false,
          first_name: "Ada",
          last_name: "Lovelace",
          username: "ada_private",
        },
      },
    })

    expect(author).toEqual({ name: "Ada Lovelace", source: "forwarded" })
  })

  test("uses hidden forwarded sender names without raw Telegram payloads", () => {
    const author = authorContextFromTelegramMessage({
      from: { id: 123, is_bot: false, first_name: "Forwarder" },
      forward_origin: {
        type: "hidden_user",
        sender_user_name: "Private Sender",
      },
    })

    expect(author).toEqual({ name: "Private Sender", source: "forwarded" })
  })

  test("uses forwarded chat titles as forwarded author context", () => {
    const author = authorContextFromTelegramMessage({
      from: { id: 123, is_bot: false, first_name: "Forwarder" },
      forward_origin: {
        type: "chat",
        sender_chat: { id: -1001, type: "supergroup", title: "Private Group" },
      },
    })

    expect(author).toEqual({ name: "Private Group", source: "forwarded" })
  })

  test("uses forwarded channel titles as forwarded author context", () => {
    const author = authorContextFromTelegramMessage({
      from: { id: 123, is_bot: false, first_name: "Forwarder" },
      forward_origin: {
        type: "channel",
        chat: { id: -1002, type: "channel", title: "Release Notes" },
      },
    })

    expect(author).toEqual({ name: "Release Notes", source: "forwarded" })
  })

  test("uses sender chat titles as current message author context", () => {
    const author = authorContextFromTelegramMessage({
      from: { id: 123, is_bot: false, first_name: "Admin" },
      sender_chat: { id: -1001, type: "supergroup", title: "Release Room" },
    })

    expect(author).toEqual({ name: "Release Room", source: "sender" })
  })

  test("uses sender chat usernames when titles are unavailable", () => {
    const author = authorContextFromTelegramMessage({
      from: { id: 123, is_bot: false, first_name: "Admin" },
      sender_chat: { id: -1002, type: "channel", username: "release_notes" },
    })

    expect(author).toEqual({ name: "@release_notes", source: "sender" })
  })

  test("keeps forwarded authors ahead of sender chat context", () => {
    const author = authorContextFromTelegramMessage({
      from: { id: 123, is_bot: false, first_name: "Forwarder" },
      sender_chat: { id: -1001, type: "supergroup", title: "Forwarding Room" },
      forward_origin: {
        type: "hidden_user",
        sender_user_name: "Original Author",
      },
    })

    expect(author).toEqual({ name: "Original Author", source: "forwarded" })
  })

  test("falls back to the authorized sender when forwarded author data is unavailable", () => {
    const author = authorContextFromTelegramMessage({
      from: { id: 123, is_bot: false, first_name: "Authorized", last_name: "User" },
      forward_origin: {
        type: "hidden_user",
        sender_user_name: " ",
      },
    })

    expect(author).toEqual({ name: "Authorized User", source: "sender" })
  })

  test("defaults normal messages to the authorized sender", () => {
    const author = authorContextFromTelegramMessage({
      from: { id: 123, is_bot: false, first_name: "Authorized", last_name: "User" },
    })

    expect(author).toEqual({ name: "Authorized User", source: "sender" })
  })

  test("does not expose numeric Telegram IDs as author names", () => {
    const author = authorContextFromTelegramMessage({
      from: { id: 123, is_bot: false, first_name: "Authorized" },
      forward_origin: {
        type: "user",
        sender_user: { id: 999, is_bot: false, first_name: " " },
      },
    })

    expect(author).toEqual({ name: "Authorized", source: "sender" })
    expect(author.name).not.toContain("999")
    expect(author.name).not.toContain("123")
  })

  test("does not expose numeric sender chat IDs as author names", () => {
    const author = authorContextFromTelegramMessage({
      from: { id: 123, is_bot: false, first_name: "Authorized" },
      sender_chat: { id: -1001, type: "supergroup" },
    })

    expect(author).toEqual({ name: "Authorized", source: "sender" })
    expect(author.name).not.toContain("1001")
    expect(author.name).not.toContain("123")
  })
})
