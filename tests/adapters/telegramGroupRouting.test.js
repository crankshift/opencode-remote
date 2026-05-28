import { describe, expect, test } from "vitest"
import {
  DEFAULT_GROUP_SETTINGS,
  evaluateGroupMessageRouting,
} from "../../src/adapters/telegram/groupRouting.js"

const botIdentity = {
  id: 9001,
  username: "OpenCodeRemoteBot",
  firstName: "Khmara",
  aliases: ["gateway"],
}

function message(overrides = {}) {
  return {
    message_id: 10,
    text: "hello",
    chat: { id: -1001, type: "supergroup" },
    from: { id: 123, is_bot: false, first_name: "Ada" },
    ...overrides,
  }
}

describe("evaluateGroupMessageRouting", () => {
  test("routes human messages that reply to the bot", () => {
    const decision = evaluateGroupMessageRouting({
      message: message({
        text: "what do you mean?",
        reply_to_message: { message_id: 9, from: { id: 9001, is_bot: true } },
      }),
      settings: DEFAULT_GROUP_SETTINGS,
      botIdentity,
    })

    expect(decision).toEqual({ route: true, trigger: "reply" })
  })

  test("routes mention and name-prefix triggers", () => {
    expect(
      evaluateGroupMessageRouting({
        message: message({ text: "hey @OpenCodeRemoteBot can you check this?" }),
        settings: DEFAULT_GROUP_SETTINGS,
        botIdentity,
      }),
    ).toEqual({ route: true, trigger: "mention" })

    expect(
      evaluateGroupMessageRouting({
        message: message({ text: "Gateway, summarize the last part" }),
        settings: DEFAULT_GROUP_SETTINGS,
        botIdentity,
      }),
    ).toEqual({ route: true, trigger: "name_prefix" })
  })

  test("does not route bot senders unless bot replies are enabled", () => {
    const botMessage = message({
      text: "Khmara, compare our answers",
      from: { id: 222, is_bot: true, first_name: "Other Bot" },
    })

    expect(
      evaluateGroupMessageRouting({
        message: botMessage,
        settings: DEFAULT_GROUP_SETTINGS,
        botIdentity,
      }),
    ).toEqual({ route: false, reason: "sender_policy" })

    expect(
      evaluateGroupMessageRouting({
        message: botMessage,
        settings: { ...DEFAULT_GROUP_SETTINGS, replyPolicy: "all" },
        botIdentity,
      }),
    ).toEqual({ route: true, trigger: "name_prefix" })
  })

  test("never routes this gateway bot's own messages", () => {
    const decision = evaluateGroupMessageRouting({
      message: message({
        text: "Khmara, this should never loop",
        from: { id: 9001, is_bot: true, first_name: "Khmara" },
      }),
      settings: { ...DEFAULT_GROUP_SETTINGS, replyPolicy: "all" },
      botIdentity,
    })

    expect(decision).toEqual({ route: false, reason: "own_message" })
  })

  test("keeps name-anywhere disabled by default", () => {
    expect(
      evaluateGroupMessageRouting({
        message: message({ text: "I wonder whether Khmara would like this" }),
        settings: DEFAULT_GROUP_SETTINGS,
        botIdentity,
      }),
    ).toEqual({ route: false, reason: "not_addressed" })

    expect(
      evaluateGroupMessageRouting({
        message: message({ text: "I wonder whether Khmara would like this" }),
        settings: {
          ...DEFAULT_GROUP_SETTINGS,
          triggers: { ...DEFAULT_GROUP_SETTINGS.triggers, nameAnywhere: true },
        },
        botIdentity,
      }),
    ).toEqual({ route: true, trigger: "name_anywhere" })
  })

  test("routes custom triggers anywhere case-insensitively", () => {
    const settings = {
      ...DEFAULT_GROUP_SETTINGS,
      customTriggers: ["codex please"],
    }

    expect(
      evaluateGroupMessageRouting({
        message: message({ text: "Can CODEX    please check this?" }),
        settings,
        botIdentity,
      }),
    ).toEqual({ route: true, trigger: "custom" })
  })

  test("treats custom trigger phrases as plain text", () => {
    const settings = {
      ...DEFAULT_GROUP_SETTINGS,
      customTriggers: ["ship.bot"],
    }

    expect(
      evaluateGroupMessageRouting({
        message: message({ text: "shipXbot should not match" }),
        settings,
        botIdentity,
      }),
    ).toEqual({ route: false, reason: "not_addressed" })

    expect(
      evaluateGroupMessageRouting({
        message: message({ text: "please ask ship.bot for help" }),
        settings,
        botIdentity,
      }),
    ).toEqual({ route: true, trigger: "custom" })
  })
})
