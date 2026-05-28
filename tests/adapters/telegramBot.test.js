import { afterEach, describe, expect, test, vi } from "vitest"
import { createTelegramBot } from "../../src/adapters/telegram/bot.js"
import { createGroupMemory } from "../../src/adapters/telegram/groupMemory.js"
import { createMemoryGroupStore } from "../../src/adapters/telegram/groupStore.js"
import { createMemoryStickerStore } from "../../src/adapters/telegram/stickerStore.js"

class FakeBot {
  constructor(token) {
    this.token = token
    this.api = { setMyCommands: vi.fn(async () => undefined) }
    this.middlewares = []
    this.commands = new Map()
    this.callbackHandlers = []
    this.messageHandlers = new Map()
    this.errorHandler = null
  }

  use(handler) {
    this.middlewares.push(handler)
  }

  command(name, handler) {
    this.commands.set(name, handler)
  }

  callbackQuery(pattern, handler) {
    this.callbackHandlers.push({ pattern, handler })
  }

  on(eventName, handler) {
    this.messageHandlers.set(eventName, handler)
  }

  catch(handler) {
    this.errorHandler = handler
  }
}

function testTelegram(overrides = {}) {
  return {
    botToken: "token",
    allowedUserIds: [123],
    allowedChatIds: [],
    ...overrides,
  }
}

describe("createTelegramBot", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  test("registers v1 command handlers and message handlers", () => {
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram(),
      controller: {},
      logger: { warn: vi.fn() },
      botFactory: FakeBot,
    })

    expect(bot.token).toBe("token")
    expect([...bot.commands.keys()]).toEqual([
      "help",
      "status",
      "new",
      "sessions",
      "stop",
      "progress",
      "voice",
      "stickers",
      "group",
    ])
    expect(bot.messageHandlers.has("message:text")).toBe(true)
    expect(bot.messageHandlers.has("message:photo")).toBe(true)
    expect(bot.messageHandlers.has("message:voice")).toBe(true)
    expect(bot.messageHandlers.has("message:sticker")).toBe(true)
    expect(bot.messageHandlers.has("message_reaction")).toBe(true)
    expect(bot.errorHandler).toEqual(expect.any(Function))
    expect(bot.api.setMyCommands).not.toHaveBeenCalled()
  })

  test("status command reports progress verbosity", async () => {
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram(),
      controller: {
        status: vi.fn(async () => ({ activeSessionId: "ses_1", progressVerbosity: "verbose" })),
      },
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })
    const reply = vi.fn(async () => undefined)

    await bot.commands.get("status")({ reply })

    expect(reply).toHaveBeenCalledWith(
      "Gateway is running. Active session: ses_1. Tool progress: verbose",
    )
  })

  test("new command primes the session with Telegram gateway instructions", async () => {
    const controller = {
      createSession: vi.fn(async () => ({ id: "ses_1", title: "New session" })),
    }
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram(),
      controller,
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })
    const reply = vi.fn(async () => undefined)

    await bot.commands.get("new")({ reply })

    expect(controller.createSession).toHaveBeenCalledWith({
      context: expect.stringContaining("Telegram gateway note:"),
    })
    expect(reply).toHaveBeenCalledWith("Created session New session")
  })

  test("progress command reports current verbosity", async () => {
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram(),
      controller: {
        getProgressVerbosity: vi.fn(async () => "all"),
      },
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })
    const reply = vi.fn(async () => undefined)

    await bot.commands.get("progress")({ message: { text: "/progress" }, reply })

    expect(reply).toHaveBeenCalledWith(
      "Tool progress is all. Use /progress off|new|all|verbose to change it.",
    )
  })

  test("progress command persists verbose verbosity", async () => {
    const controller = {
      setProgressVerbosity: vi.fn(async () => ({ progressVerbosity: "verbose" })),
    }
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram(),
      controller,
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })
    const reply = vi.fn(async () => undefined)

    await bot.commands.get("progress")({ message: { text: "/progress verbose" }, reply })

    expect(controller.setProgressVerbosity).toHaveBeenCalledWith("verbose")
    expect(reply).toHaveBeenCalledWith("Tool progress set to verbose.")
  })

  test("progress command is private-chat only", async () => {
    const controller = {
      setProgressVerbosity: vi.fn(),
    }
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram({ allowedChatIds: [-1001] }),
      controller,
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })
    const reply = vi.fn(async () => undefined)

    await bot.commands.get("progress")({
      message: { text: "/progress verbose", chat: { id: -1001, type: "supergroup" } },
      chat: { id: -1001, type: "supergroup" },
      reply,
    })

    expect(controller.setProgressVerbosity).not.toHaveBeenCalled()
    expect(reply).toHaveBeenCalledWith("Tool progress is only available in private chats.")
  })

  test("progress command rejects unknown verbosity", async () => {
    const controller = {
      setProgressVerbosity: vi.fn(),
    }
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram(),
      controller,
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })
    const reply = vi.fn(async () => undefined)

    await bot.commands.get("progress")({ message: { text: "/progress loud" }, reply })

    expect(controller.setProgressVerbosity).not.toHaveBeenCalled()
    expect(reply).toHaveBeenCalledWith("Use /progress off|new|all|verbose.")
  })

  test("voice status command reports provider readiness", async () => {
    const voiceService = {
      status: vi.fn(async () => ({
        enabled: true,
        mode: "on",
        captions: true,
        voice: "en-US-AndrewNeural",
        sttModel: "whisper-large-v3-turbo",
        hasGroqApiKey: true,
        ffmpegAvailable: false,
        cacheDirectory: "/cache/voice",
      })),
    }
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram(),
      controller: {},
      voiceService,
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })
    const reply = vi.fn(async () => undefined)

    await bot.commands.get("voice")({ message: { text: "/voice status" }, reply })

    expect(reply).toHaveBeenCalledWith(
      [
        "Voice mode: on",
        "Voice captions: on",
        "Voice: en-US-AndrewNeural",
        "STT model: whisper-large-v3-turbo",
        "Groq API key: configured",
        "ffmpeg: missing",
        "Cache: /cache/voice",
      ].join("\n"),
    )
  })

  test("voice mode commands persist mode changes", async () => {
    const voiceService = { setMode: vi.fn(async () => ({ enabled: true, mode: "all" })) }
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram(),
      controller: {},
      voiceService,
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })
    const reply = vi.fn(async () => undefined)

    await bot.commands.get("voice")({ message: { text: "/voice all" }, reply })

    expect(voiceService.setMode).toHaveBeenCalledWith("all")
    expect(reply).toHaveBeenCalledWith("Voice mode set to all.")
  })

  test("voice captions command reports current setting and usage", async () => {
    const voiceService = {
      status: vi.fn(async () => ({ captions: false })),
    }
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram(),
      controller: {},
      voiceService,
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })
    const reply = vi.fn(async () => undefined)

    await bot.commands.get("voice")({ message: { text: "/voice captions" }, reply })

    expect(voiceService.status).toHaveBeenCalled()
    expect(reply).toHaveBeenCalledWith(
      "Voice captions are off. Use /voice captions on|off to change it.",
    )
  })

  test("voice captions command persists caption changes", async () => {
    const voiceService = { setCaptions: vi.fn(async () => ({ captions: true })) }
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram(),
      controller: {},
      voiceService,
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })
    const reply = vi.fn(async () => undefined)

    await bot.commands.get("voice")({ message: { text: "/voice captions on" }, reply })

    expect(voiceService.setCaptions).toHaveBeenCalledWith(true)
    expect(reply).toHaveBeenCalledWith("Voice captions set to on.")
  })

  test("voice list command supports country code and optional page", async () => {
    const voiceService = {
      listVoices: vi.fn(async () => ({
        voices: [
          {
            ShortName: "uk-UA-OstapNeural",
            Locale: "uk-UA",
            Gender: "Male",
            FriendlyName: "Microsoft Ostap Online",
          },
        ],
        page: 2,
        totalPages: 3,
        total: 21,
      })),
    }
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram(),
      controller: {},
      voiceService,
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })
    const reply = vi.fn(async () => undefined)

    await bot.commands.get("voice")({ message: { text: "/voice list ua 2" }, reply })

    expect(voiceService.listVoices).toHaveBeenCalledWith({
      locale: "ua",
      page: 2,
      pageSize: 20,
    })
    expect(reply).toHaveBeenCalledWith(
      [
        "Voices page 2/3 (21 total):",
        "uk-UA-OstapNeural - uk-UA, Male - Microsoft Ostap Online",
      ].join("\n"),
    )
  })

  test("voice list command requires a country or locale filter", async () => {
    const voiceService = {
      listVoices: vi.fn(async () => ({ voices: [], page: 1, totalPages: 1, total: 0 })),
    }
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram(),
      controller: {},
      voiceService,
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })
    const reply = vi.fn(async () => undefined)

    await bot.commands.get("voice")({ message: { text: "/voice list" }, reply })

    expect(voiceService.listVoices).not.toHaveBeenCalled()
    expect(reply).toHaveBeenCalledWith("Use /voice list <countryCode|locale> [page].")
  })

  test("voice list command rejects unsupported filters", async () => {
    const voiceService = {
      listVoices: vi.fn(async () => ({ voices: [], page: 1, totalPages: 1, total: 0 })),
    }
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram(),
      controller: {},
      voiceService,
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })
    const reply = vi.fn(async () => undefined)

    await bot.commands.get("voice")({ message: { text: "/voice list en male 2" }, reply })

    expect(voiceService.listVoices).not.toHaveBeenCalled()
    expect(reply).toHaveBeenCalledWith("Use /voice list <countryCode|locale> [page].")
  })

  test("voice list command accepts full locale codes", async () => {
    const voiceService = {
      listVoices: vi.fn(async () => ({
        voices: [
          {
            ShortName: "en-US-AndrewNeural",
            Locale: "en-US",
            Gender: "Male",
            FriendlyName: "Microsoft Andrew Online",
          },
        ],
        page: 1,
        totalPages: 1,
        total: 1,
      })),
    }
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram(),
      controller: {},
      voiceService,
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })
    const reply = vi.fn(async () => undefined)

    await bot.commands.get("voice")({ message: { text: "/voice list en-US" }, reply })

    expect(voiceService.listVoices).toHaveBeenCalledWith({
      locale: "en-us",
      page: 1,
      pageSize: 20,
    })
    expect(reply).toHaveBeenCalledWith(
      [
        "Voices page 1/1 (1 total):",
        "en-US-AndrewNeural - en-US, Male - Microsoft Andrew Online",
      ].join("\n"),
    )
  })

  test("voice set validates and persists selected voice", async () => {
    const voiceService = {
      setVoice: vi.fn(async () => ({ ShortName: "uk-UA-OstapNeural" })),
    }
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram(),
      controller: {},
      voiceService,
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })
    const reply = vi.fn(async () => undefined)

    await bot.commands.get("voice")({ message: { text: "/voice set uk-UA-OstapNeural" }, reply })

    expect(voiceService.setVoice).toHaveBeenCalledWith("uk-UA-OstapNeural")
    expect(reply).toHaveBeenCalledWith("Voice set to uk-UA-OstapNeural.")
  })

  test("voice test sends a sample voice note", async () => {
    const voiceService = {
      synthesizeTelegramVoice: vi.fn(async () => ({ filePath: "/cache/test.ogg" })),
    }
    const sendVoice = vi.fn(async () => ({ message_id: 10, chat: { id: 456 } }))
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram(),
      controller: {},
      voiceService,
      sendVoice,
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })
    const ctx = { message: { text: "/voice test" }, reply: vi.fn(async () => undefined) }

    await bot.commands.get("voice")(ctx)

    expect(voiceService.synthesizeTelegramVoice).toHaveBeenCalledWith("OpenCode Remote voice test.")
    expect(sendVoice).toHaveBeenCalledWith({ ctx, filePath: "/cache/test.ogg" })
    expect(ctx.reply).toHaveBeenCalledWith("Voice test sent.")
  })

  test("authorization middleware stops unauthorized updates", async () => {
    const logger = { warn: vi.fn() }
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram(),
      controller: {},
      logger,
      botFactory: FakeBot,
    })
    const next = vi.fn()

    await bot.middlewares[0]({ from: { id: 999 } }, next)

    expect(next).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalled()
  })

  test("authorization middleware allows configured human users in private chats", async () => {
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram({ allowedUserIds: [123, 456] }),
      controller: {},
      logger: { warn: vi.fn() },
      botFactory: FakeBot,
    })
    const next = vi.fn()

    await bot.middlewares[0](
      { from: { id: 456, is_bot: false }, chat: { id: 456, type: "private" } },
      next,
    )

    expect(next).toHaveBeenCalled()
  })

  test("authorization middleware rejects configured human users in unallowed groups", async () => {
    const logger = { warn: vi.fn() }
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram({ allowedUserIds: [456], allowedChatIds: [] }),
      controller: {},
      logger,
      botFactory: FakeBot,
    })
    const next = vi.fn()

    await bot.middlewares[0](
      { from: { id: 456, is_bot: false }, chat: { id: -1001, type: "supergroup" } },
      next,
    )

    expect(next).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalled()
  })

  test("authorization middleware allows humans in allowed group chats", async () => {
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram({ allowedUserIds: [], allowedChatIds: [-1001] }),
      controller: {},
      logger: { warn: vi.fn() },
      botFactory: FakeBot,
    })
    const next = vi.fn()

    await bot.middlewares[0](
      { from: { id: 777, is_bot: false }, chat: { id: -1001, type: "supergroup" } },
      next,
    )

    expect(next).toHaveBeenCalled()
  })

  test("authorization middleware allows bots in allowed group chats", async () => {
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram({ allowedUserIds: [], allowedChatIds: [-1001] }),
      controller: {},
      logger: { warn: vi.fn() },
      botFactory: FakeBot,
    })
    const next = vi.fn()

    await bot.middlewares[0](
      { from: { id: 777, is_bot: true }, chat: { id: -1001, type: "supergroup" } },
      next,
    )

    expect(next).toHaveBeenCalled()
  })

  test("authorization middleware rejects messages in unallowed groups", async () => {
    const logger = { warn: vi.fn() }
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram({ allowedUserIds: [], allowedChatIds: [-1001] }),
      controller: {},
      logger,
      botFactory: FakeBot,
    })
    const next = vi.fn()

    await bot.middlewares[0](
      { from: { id: 777, is_bot: true }, chat: { id: -2002, type: "supergroup" } },
      next,
    )

    expect(next).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalled()
  })

  test("group command opens a DM menu of known groups", async () => {
    const groupStore = createMemoryGroupStore({ allowedChatIds: [-1001] })
    await groupStore.upsertKnownGroup({
      chatId: -1001,
      title: "Build Room",
      username: "build_room",
      type: "supergroup",
      status: "active",
    })
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram({ allowedUserIds: [123], allowedChatIds: [-1001] }),
      controller: {},
      groupStore,
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })
    const reply = vi.fn(async () => undefined)

    await bot.commands.get("group")({
      from: { id: 123, is_bot: false },
      chat: { id: 123, type: "private" },
      message: { text: "/group", chat: { id: 123, type: "private" } },
      reply,
    })

    expect(reply).toHaveBeenCalledWith(
      "Select a Telegram group to configure:",
      expect.objectContaining({
        reply_markup: expect.objectContaining({
          inline_keyboard: expect.arrayContaining([
            [expect.objectContaining({ text: "Build Room" })],
          ]),
        }),
      }),
    )
  })

  test("group command in group replies with a DM-only notice", async () => {
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram({ allowedUserIds: [123], allowedChatIds: [-1001] }),
      controller: {},
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
      botIdentity: { username: "OpenCodeRemoteBot" },
    })
    const reply = vi.fn(async () => undefined)

    await bot.commands.get("group")({
      from: { id: 777, is_bot: false },
      chat: { id: -1001, type: "supergroup" },
      message: { text: "/group@OpenCodeRemoteBot", chat: { id: -1001, type: "supergroup" } },
      reply,
    })

    expect(reply).toHaveBeenCalledWith(
      "Group settings are managed in DM. Message me and run /group.",
    )
  })

  test("error handler logs and sends a safe reply", async () => {
    const logger = { warn: vi.fn(), error: vi.fn() }
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram(),
      controller: {},
      logger,
      botFactory: FakeBot,
    })
    const reply = vi.fn(async () => undefined)

    await bot.errorHandler({ ctx: { reply }, error: new Error("secret stack") })

    expect(logger.error).toHaveBeenCalled()
    expect(reply).toHaveBeenCalledWith("OpenCode Remote failed while handling that request.")
  })

  test("sessions command truncates labels and uses bounded callback data", async () => {
    const longTitle = "a".repeat(120)
    const longId = "ses_".padEnd(120, "x")
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram(),
      controller: {
        listSessions: vi.fn(async () => [{ id: longId, title: longTitle }]),
      },
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })
    const reply = vi.fn(async () => undefined)

    await bot.commands.get("sessions")({ reply })

    const keyboard = reply.mock.calls[0][1].reply_markup.inline_keyboard
    const button = keyboard[0][0]
    expect(button.text.length).toBeLessThanOrEqual(64)
    expect(button.callback_data).toBe("session:0")
  })

  test("session callback resolves bounded callback data to stored session ID", async () => {
    const longId = "ses_".padEnd(120, "x")
    const controller = {
      listSessions: vi.fn(async () => [{ id: longId, title: "Session" }]),
      selectSession: vi.fn(async () => undefined),
    }
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram(),
      controller,
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })

    await bot.commands.get("sessions")({ reply: vi.fn(async () => undefined) })
    await bot.callbackHandlers[0].handler({
      match: ["session:0", "0"],
      answerCallbackQuery: vi.fn(async () => undefined),
      reply: vi.fn(async () => undefined),
    })

    expect(controller.selectSession).toHaveBeenCalledWith(longId)
  })

  test("new and session selection clear ephemeral group memory", async () => {
    const groupMemory = { ...createGroupMemory(), clearAll: vi.fn() }
    const controller = {
      createSession: vi.fn(async () => ({ id: "ses_new", title: "New" })),
      listSessions: vi.fn(async () => [{ id: "ses_existing", title: "Existing" }]),
      selectSession: vi.fn(async () => undefined),
    }
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram(),
      controller,
      groupMemory,
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })

    await bot.commands.get("new")({ reply: vi.fn(async () => undefined) })
    await bot.commands.get("sessions")({ reply: vi.fn(async () => undefined) })
    await bot.callbackHandlers[0].handler({
      match: ["session:0", "0"],
      answerCallbackQuery: vi.fn(async () => undefined),
      reply: vi.fn(async () => undefined),
    })

    expect(groupMemory.clearAll).toHaveBeenCalledTimes(2)
  })

  test("stop command reports when there is no active session", async () => {
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram(),
      controller: {
        stop: vi.fn(async () => ({ stopped: false, reason: "no_active_session" })),
      },
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })
    const reply = vi.fn(async () => undefined)

    await bot.commands.get("stop")({ reply })

    expect(reply).toHaveBeenCalledWith("No active OpenCode session to stop.")
  })

  test("text prompts show typing instead of sending a status reply", async () => {
    vi.useFakeTimers()
    const controller = {
      sendPrompt: vi.fn(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve("answer"), 4100)
          }),
      ),
    }
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram(),
      controller,
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })
    const reply = vi.fn(async () => undefined)
    const sendChatAction = vi.fn(async () => undefined)

    const handling = bot.messageHandlers.get("message:text")({
      message: { text: "hello", chat: { id: 456 } },
      api: { sendChatAction },
      reply,
    })

    await vi.advanceTimersByTimeAsync(4100)
    await handling

    expect(reply).not.toHaveBeenCalledWith("Sending prompt to OpenCode...")
    expect(sendChatAction).toHaveBeenCalledTimes(2)
    expect(sendChatAction).toHaveBeenNthCalledWith(1, 456, "typing")
    expect(sendChatAction).toHaveBeenNthCalledWith(2, 456, "typing")
    expect(reply).toHaveBeenCalledWith("answer")
    vi.useRealTimers()
  })

  test("text prompts apply and clear an eye reaction", async () => {
    const controller = {
      sendPrompt: vi.fn(async () => "answer"),
    }
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram(),
      controller,
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })
    const reply = vi.fn(async () => ({ message_id: 11, chat: { id: 456 }, text: "answer" }))
    const sendChatAction = vi.fn(async () => undefined)
    const setMessageReaction = vi.fn(async () => true)

    await bot.messageHandlers.get("message:text")({
      message: {
        message_id: 10,
        text: "hello",
        chat: { id: 456 },
        from: { id: 123, is_bot: false, first_name: "Authorized", last_name: "User" },
      },
      api: { sendChatAction, setMessageReaction },
      reply,
    })

    expect(setMessageReaction).toHaveBeenNthCalledWith(1, 456, 10, [{ type: "emoji", emoji: "👀" }])
    expect(controller.sendPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("hello"),
        author: { name: "Authorized User", source: "sender" },
      }),
      expect.objectContaining({ onProgress: expect.any(Function) }),
    )
    expect(reply).toHaveBeenCalledWith("answer")
    expect(setMessageReaction).toHaveBeenNthCalledWith(2, 456, 10, [])
  })

  test("forwarded text prompts include forwarded author context", async () => {
    const controller = {
      sendPrompt: vi.fn(async () => "answer"),
    }
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram(),
      controller,
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })

    await bot.messageHandlers.get("message:text")({
      message: {
        message_id: 10,
        text: "please summarize this",
        chat: { id: 456 },
        from: { id: 123, is_bot: false, first_name: "Forwarder" },
        forward_origin: {
          type: "user",
          sender_user: {
            id: 999,
            is_bot: false,
            first_name: "Ada",
            last_name: "Lovelace",
          },
        },
      },
      api: {
        sendChatAction: vi.fn(async () => undefined),
        setMessageReaction: vi.fn(async () => true),
      },
      reply: vi.fn(async () => ({ message_id: 11, chat: { id: 456 }, text: "answer" })),
    })

    expect(controller.sendPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("please summarize this"),
        author: { name: "Ada Lovelace", source: "forwarded" },
      }),
      expect.objectContaining({ onProgress: expect.any(Function) }),
    )
  })

  test("forwarded text prompts without author data fall back to the sender", async () => {
    const controller = {
      sendPrompt: vi.fn(async () => "answer"),
    }
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram(),
      controller,
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })

    await bot.messageHandlers.get("message:text")({
      message: {
        message_id: 10,
        text: "please summarize this",
        chat: { id: 456 },
        from: { id: 123, is_bot: false, first_name: "Authorized", last_name: "User" },
        forward_origin: { type: "hidden_user", sender_user_name: " " },
      },
      api: {
        sendChatAction: vi.fn(async () => undefined),
        setMessageReaction: vi.fn(async () => true),
      },
      reply: vi.fn(async () => ({ message_id: 11, chat: { id: 456 }, text: "answer" })),
    })

    expect(controller.sendPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("please summarize this"),
        author: { name: "Authorized User", source: "sender" },
      }),
      expect.objectContaining({ onProgress: expect.any(Function) }),
    )
  })

  test("normal text prompts include the sender as author context", async () => {
    const controller = {
      sendPrompt: vi.fn(async () => "answer"),
    }
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram(),
      controller,
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })

    await bot.messageHandlers.get("message:text")({
      message: {
        message_id: 10,
        text: "hello",
        chat: { id: 456 },
        from: { id: 123, is_bot: false, first_name: "Authorized", last_name: "User" },
      },
      api: {
        sendChatAction: vi.fn(async () => undefined),
        setMessageReaction: vi.fn(async () => true),
      },
      reply: vi.fn(async () => ({ message_id: 11, chat: { id: 456 }, text: "answer" })),
    })

    expect(controller.sendPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("hello"),
        author: { name: "Authorized User", source: "sender" },
      }),
      expect.objectContaining({ onProgress: expect.any(Function) }),
    )
  })

  test("normal text prompts include sender chat author context", async () => {
    const controller = {
      sendPrompt: vi.fn(async () => "answer"),
    }
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram(),
      controller,
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })

    await bot.messageHandlers.get("message:text")({
      message: {
        message_id: 10,
        text: "hello from the room",
        chat: { id: 456 },
        from: { id: 123, is_bot: false, first_name: "Admin" },
        sender_chat: { id: -1001, type: "supergroup", title: "Release Room" },
      },
      api: {
        sendChatAction: vi.fn(async () => undefined),
        setMessageReaction: vi.fn(async () => true),
      },
      reply: vi.fn(async () => ({ message_id: 11, chat: { id: 456 }, text: "answer" })),
    })

    expect(controller.sendPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("hello from the room"),
        author: { name: "Release Room", source: "sender" },
      }),
      expect.objectContaining({ onProgress: expect.any(Function) }),
    )
  })

  test("text prompts in voice all mode send voice replies without text", async () => {
    const controller = {
      sendPrompt: vi.fn(async () => "answer"),
    }
    const voiceService = {
      shouldSpeak: vi.fn(() => true),
      synthesizeTelegramVoice: vi.fn(async () => ({ filePath: "/cache/reply.ogg" })),
    }
    const sendVoice = vi.fn(async () => ({ message_id: 12, chat: { id: 456 } }))
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram(),
      controller,
      voiceService,
      sendVoice,
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })
    const reply = vi.fn(async (text) => ({ message_id: 11, chat: { id: 456 }, text }))

    await bot.messageHandlers.get("message:text")({
      message: {
        message_id: 10,
        text: "hello",
        chat: { id: 456 },
        from: { id: 123, is_bot: false, first_name: "Authorized", last_name: "User" },
      },
      api: {
        sendChatAction: vi.fn(async () => undefined),
        setMessageReaction: vi.fn(async () => true),
      },
      reply,
    })

    expect(reply).not.toHaveBeenCalled()
    expect(voiceService.shouldSpeak).toHaveBeenCalledWith({ source: "text" })
    expect(voiceService.synthesizeTelegramVoice).toHaveBeenCalledWith("answer")
    expect(sendVoice).toHaveBeenCalledWith({
      ctx: expect.objectContaining({ reply }),
      filePath: "/cache/reply.ogg",
    })
  })

  test("voice captions add short assistant text to successful voice replies", async () => {
    const controller = {
      sendPrompt: vi.fn(async () => "answer"),
    }
    const voiceService = {
      shouldSpeak: vi.fn(() => true),
      shouldCaption: vi.fn(() => true),
      synthesizeTelegramVoice: vi.fn(async () => ({ filePath: "/cache/reply.ogg" })),
    }
    const sendVoice = vi.fn(async () => ({ message_id: 12, chat: { id: 456 } }))
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram(),
      controller,
      voiceService,
      sendVoice,
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })
    const reply = vi.fn(async (text) => ({ message_id: 11, chat: { id: 456 }, text }))

    await bot.messageHandlers.get("message:text")({
      message: {
        message_id: 10,
        text: "hello",
        chat: { id: 456 },
        from: { id: 123, is_bot: false, first_name: "Authorized", last_name: "User" },
      },
      api: {
        sendChatAction: vi.fn(async () => undefined),
        setMessageReaction: vi.fn(async () => true),
      },
      reply,
    })

    expect(reply).not.toHaveBeenCalled()
    expect(voiceService.shouldCaption).toHaveBeenCalled()
    expect(sendVoice).toHaveBeenCalledWith({
      ctx: expect.objectContaining({ reply }),
      filePath: "/cache/reply.ogg",
      caption: "answer",
    })
  })

  test("voice captions send long assistant text as a companion message", async () => {
    const longAnswer = "a".repeat(1025)
    const controller = {
      sendPrompt: vi.fn(async () => longAnswer),
    }
    const voiceService = {
      shouldSpeak: vi.fn(() => true),
      shouldCaption: vi.fn(() => true),
      synthesizeTelegramVoice: vi.fn(async () => ({ filePath: "/cache/reply.ogg" })),
    }
    const sendVoice = vi.fn(async () => ({ message_id: 12, chat: { id: 456 } }))
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram(),
      controller,
      voiceService,
      sendVoice,
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })
    const reply = vi.fn(async (text) => ({ message_id: 11, chat: { id: 456 }, text }))

    await bot.messageHandlers.get("message:text")({
      message: {
        message_id: 10,
        text: "hello",
        chat: { id: 456 },
        from: { id: 123, is_bot: false, first_name: "Authorized", last_name: "User" },
      },
      api: {
        sendChatAction: vi.fn(async () => undefined),
        setMessageReaction: vi.fn(async () => true),
      },
      reply,
    })

    expect(sendVoice).toHaveBeenCalledWith({
      ctx: expect.objectContaining({ reply }),
      filePath: "/cache/reply.ogg",
    })
    expect(reply).toHaveBeenCalledTimes(1)
    expect(reply).toHaveBeenCalledWith(longAnswer)
  })

  test("permission requests are sent as text with approval buttons in voice mode", async () => {
    const controller = {
      sendPrompt: vi.fn(async (_prompt, options) => {
        if (typeof options?.onSystemEvent === "function") {
          await options.onSystemEvent({
            type: "permission.requested",
            sessionId: "ses_1",
            permissionId: "perm_1",
            title: "Run shell command",
            description: "pnpm test",
            tool: "bash",
          })
        }
        return "answer"
      }),
    }
    const voiceService = {
      shouldSpeak: vi.fn(() => true),
      shouldCaption: vi.fn(() => true),
      synthesizeTelegramVoice: vi.fn(async () => ({ filePath: "/cache/reply.ogg" })),
    }
    const sendVoice = vi.fn(async () => ({ message_id: 12, chat: { id: 456 } }))
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram(),
      controller,
      voiceService,
      sendVoice,
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })
    const reply = vi.fn(async (text, options) => ({
      message_id: 11,
      chat: { id: 456 },
      text,
      reply_markup: options?.reply_markup,
    }))

    await bot.messageHandlers.get("message:text")({
      message: {
        message_id: 10,
        text: "hello",
        chat: { id: 456 },
        from: { id: 123, is_bot: false, first_name: "Authorized", last_name: "User" },
      },
      api: {
        sendChatAction: vi.fn(async () => undefined),
        setMessageReaction: vi.fn(async () => true),
      },
      reply,
    })

    const permissionCall = reply.mock.calls.find(([text]) =>
      text.startsWith("OpenCode needs permission"),
    )
    expect(permissionCall[0]).toBe(
      [
        "OpenCode needs permission:",
        "Run shell command",
        "Tool: bash",
        "pnpm test",
        "",
        "Choose how to respond:",
      ].join("\n"),
    )
    const buttons = permissionCall[1].reply_markup.inline_keyboard.flat()
    expect(buttons.map((button) => button.text)).toEqual(["Allow once", "Always allow", "Deny"])
    expect(buttons.map((button) => button.callback_data)).toEqual([
      "perm:once:0",
      "perm:always:0",
      "perm:reject:0",
    ])
    expect(voiceService.synthesizeTelegramVoice).toHaveBeenCalledWith("answer")
    expect(voiceService.synthesizeTelegramVoice).not.toHaveBeenCalledWith(
      expect.stringContaining("OpenCode needs permission"),
    )
    expect(sendVoice).toHaveBeenCalledWith({
      ctx: expect.objectContaining({ reply }),
      filePath: "/cache/reply.ogg",
      caption: "answer",
    })
  })

  test("permission callbacks send the selected decision to OpenCode", async () => {
    let permissionCallbackData
    const controller = {
      sendPrompt: vi.fn(async (_prompt, options) => {
        if (typeof options?.onSystemEvent === "function") {
          await options.onSystemEvent({
            type: "permission.requested",
            sessionId: "ses_1",
            permissionId: "perm_1",
            title: "Run shell command",
          })
        }
        return "answer"
      }),
      respondToPermission: vi.fn(async () => true),
    }
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram(),
      controller,
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })
    const reply = vi.fn(async (text, options) => {
      if (text.startsWith("OpenCode needs permission")) {
        permissionCallbackData = options.reply_markup.inline_keyboard[1][0].callback_data
      }
      return { message_id: 11, chat: { id: 456 }, text }
    })

    await bot.messageHandlers.get("message:text")({
      message: { message_id: 10, text: "hello", chat: { id: 456 } },
      api: {
        sendChatAction: vi.fn(async () => undefined),
        setMessageReaction: vi.fn(async () => true),
      },
      reply,
    })

    const handler = bot.callbackHandlers.find(({ pattern }) => pattern.test(permissionCallbackData))
    expect(handler).toBeDefined()
    await handler.handler({
      match: permissionCallbackData.match(handler.pattern),
      answerCallbackQuery: vi.fn(async () => undefined),
      reply: vi.fn(async () => undefined),
    })

    expect(controller.respondToPermission).toHaveBeenCalledWith("ses_1", "perm_1", "always")
  })

  test("text prompts fall back to text when voice reply fails", async () => {
    const controller = {
      sendPrompt: vi.fn(async () => "answer"),
    }
    const logger = { warn: vi.fn(), error: vi.fn() }
    const voiceService = {
      shouldSpeak: vi.fn(() => true),
      shouldCaption: vi.fn(() => true),
      synthesizeTelegramVoice: vi.fn(async () => {
        throw new Error("ffmpeg missing")
      }),
    }
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram(),
      controller,
      voiceService,
      logger,
      botFactory: FakeBot,
    })
    const reply = vi.fn(async (text) => ({ message_id: 11, chat: { id: 456 }, text }))

    await bot.messageHandlers.get("message:text")({
      message: { message_id: 10, text: "hello", chat: { id: 456 } },
      api: {
        sendChatAction: vi.fn(async () => undefined),
        setMessageReaction: vi.fn(async () => true),
      },
      reply,
    })

    expect(reply).toHaveBeenCalledTimes(1)
    expect(reply).toHaveBeenCalledWith("answer")
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.any(Error) }),
      "Could not send Telegram voice reply",
    )
  })

  test("text prompts fall back to text when voice sending fails", async () => {
    const controller = {
      sendPrompt: vi.fn(async () => "answer"),
    }
    const logger = { warn: vi.fn(), error: vi.fn() }
    const voiceService = {
      shouldSpeak: vi.fn(() => true),
      shouldCaption: vi.fn(() => true),
      synthesizeTelegramVoice: vi.fn(async () => ({ filePath: "/cache/reply.ogg" })),
    }
    const sendVoice = vi.fn(async () => {
      throw new Error("Telegram send failed")
    })
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram(),
      controller,
      voiceService,
      sendVoice,
      logger,
      botFactory: FakeBot,
    })
    const reply = vi.fn(async (text) => ({ message_id: 11, chat: { id: 456 }, text }))

    await bot.messageHandlers.get("message:text")({
      message: { message_id: 10, text: "hello", chat: { id: 456 } },
      api: {
        sendChatAction: vi.fn(async () => undefined),
        setMessageReaction: vi.fn(async () => true),
      },
      reply,
    })

    expect(sendVoice).toHaveBeenCalledWith({
      ctx: expect.objectContaining({ reply }),
      filePath: "/cache/reply.ogg",
      caption: "answer",
    })
    expect(reply).toHaveBeenCalledTimes(1)
    expect(reply).toHaveBeenCalledWith("answer")
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.any(Error) }),
      "Could not send Telegram voice reply",
    )
  })

  test("text prompts render tool progress in an editable activity message", async () => {
    const controller = {
      sendPrompt: vi.fn(async (_prompt, options) => {
        await options.onProgress({
          type: "tool.updated",
          partId: "part_1",
          tool: "skill_view",
          title: "brainstorming",
        })
        await options.onProgress({
          type: "tool.updated",
          partId: "part_2",
          tool: "bash",
        })
        return "answer"
      }),
    }
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram(),
      controller,
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
      progressVerbosity: "all",
      progressEditThrottleMs: 0,
    })
    const reply = vi.fn(async (text) => ({
      message_id: text.startsWith("Activity") ? 20 : 21,
      chat: { id: 456 },
      text,
    }))
    const editMessageText = vi.fn(async () => true)

    await bot.messageHandlers.get("message:text")({
      message: { message_id: 10, text: "hello", chat: { id: 456 } },
      api: {
        sendChatAction: vi.fn(async () => undefined),
        setMessageReaction: vi.fn(async () => true),
        editMessageText,
      },
      reply,
    })

    expect(reply).toHaveBeenCalledWith("Activity\n📚 skill_view: brainstorming")
    expect(editMessageText).toHaveBeenCalledWith(
      456,
      20,
      "Activity\n📚 skill_view: brainstorming\n💻 bash",
    )
    expect(reply).toHaveBeenCalledWith("answer")
  })

  test("text prompts do not render tool progress in group chats", async () => {
    const controller = {
      sendPrompt: vi.fn(async (_prompt, options) => {
        expect(options).not.toHaveProperty("onProgress")
        return "answer"
      }),
    }
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram({ allowedChatIds: [-1001] }),
      controller,
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
      progressVerbosity: "all",
      progressEditThrottleMs: 0,
      botIdentity: { id: 9001, username: "OpenCodeRemoteBot", firstName: "Khmara" },
    })
    const reply = vi.fn(async (text) => ({ message_id: 21, chat: { id: -1001 }, text }))
    const editMessageText = vi.fn(async () => true)

    await bot.messageHandlers.get("message:text")({
      message: {
        message_id: 10,
        text: "Khmara, hello",
        chat: { id: -1001, type: "supergroup" },
        from: { id: 777, is_bot: false, first_name: "Group" },
      },
      chat: { id: -1001, type: "supergroup" },
      api: {
        sendChatAction: vi.fn(async () => undefined),
        setMessageReaction: vi.fn(async () => true),
        editMessageText,
      },
      reply,
    })

    expect(reply).not.toHaveBeenCalledWith(expect.stringContaining("Activity"))
    expect(editMessageText).not.toHaveBeenCalled()
    expect(reply).toHaveBeenCalledWith("answer")
  })

  test("group text is remembered passively and only routed when addressed", async () => {
    const controller = {
      sendPrompt: vi.fn(async () => "group answer"),
    }
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram({ allowedUserIds: [123], allowedChatIds: [-1001] }),
      controller,
      groupStore: createMemoryGroupStore({ allowedChatIds: [-1001] }),
      groupMemory: createGroupMemory({ contextMessages: 10, contextChars: 1_000 }),
      botIdentity: { id: 9001, username: "OpenCodeRemoteBot", firstName: "Khmara" },
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })
    const passiveReply = vi.fn(async () => undefined)
    const activeReply = vi.fn(async () => ({
      message_id: 12,
      chat: { id: -1001 },
      text: "group answer",
    }))
    const setMessageReaction = vi.fn(async () => true)

    await bot.messageHandlers.get("message:text")({
      message: {
        message_id: 10,
        text: "we should use sqlite",
        chat: { id: -1001, type: "supergroup" },
        from: { id: 777, is_bot: false, first_name: "Ada" },
      },
      chat: { id: -1001, type: "supergroup" },
      api: { sendChatAction: vi.fn(async () => undefined), setMessageReaction },
      reply: passiveReply,
    })

    await bot.messageHandlers.get("message:text")({
      message: {
        message_id: 11,
        text: "Khmara, what do you think?",
        chat: { id: -1001, type: "supergroup" },
        from: { id: 778, is_bot: false, first_name: "Grace" },
      },
      chat: { id: -1001, type: "supergroup" },
      api: { sendChatAction: vi.fn(async () => undefined), setMessageReaction },
      reply: activeReply,
    })

    expect(passiveReply).not.toHaveBeenCalled()
    expect(controller.sendPrompt).toHaveBeenCalledTimes(1)
    expect(controller.sendPrompt.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        text: expect.stringContaining("Recent Telegram group context:"),
      }),
    )
    expect(controller.sendPrompt.mock.calls[0][0].text).toContain("Ada: we should use sqlite")
    expect(controller.sendPrompt.mock.calls[0][0].text).not.toContain(
      "Grace: Khmara, what do you think?",
    )
    expect(activeReply).toHaveBeenCalledWith("group answer")
    expect(setMessageReaction).toHaveBeenNthCalledWith(1, -1001, 11, [
      { type: "emoji", emoji: "👀" },
    ])
    expect(setMessageReaction).toHaveBeenNthCalledWith(2, -1001, 11, [])
  })

  test("custom group triggers can be configured in DM and route group text", async () => {
    const controller = { sendPrompt: vi.fn(async () => "custom answer") }
    const groupStore = createMemoryGroupStore({ allowedChatIds: [-1001] })
    await groupStore.upsertKnownGroup({ chatId: -1001, title: "Build Room", type: "supergroup" })
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram({ allowedUserIds: [123], allowedChatIds: [-1001] }),
      controller,
      groupStore,
      groupMemory: createGroupMemory({ contextMessages: 10, contextChars: 1_000 }),
      botIdentity: { id: 9001, username: "OpenCodeRemoteBot", firstName: "Khmara" },
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })
    const dmReply = vi.fn(async (_text, options) => ({ reply_markup: options?.reply_markup }))

    await bot.commands.get("group")({
      from: { id: 123, is_bot: false },
      chat: { id: 123, type: "private" },
      message: { text: "/group", chat: { id: 123, type: "private" } },
      reply: dmReply,
    })
    const selectData = dmReply.mock.calls[0][1].reply_markup.inline_keyboard[0][0].callback_data
    const groupCallback = bot.callbackHandlers.find(({ pattern }) =>
      pattern.test(selectData),
    ).handler
    await groupCallback({
      from: { id: 123, is_bot: false },
      match: [selectData, selectData.replace("group:", "")],
      answerCallbackQuery: vi.fn(async () => undefined),
      reply: dmReply,
    })
    const addButton = dmReply.mock.calls
      .at(-1)[1]
      .reply_markup.inline_keyboard.flat()
      .find((button) => button.text === "Add custom trigger")
    await groupCallback({
      from: { id: 123, is_bot: false },
      match: [addButton.callback_data, addButton.callback_data.replace("group:", "")],
      answerCallbackQuery: vi.fn(async () => undefined),
      reply: dmReply,
    })

    await bot.messageHandlers.get("message:text")({
      from: { id: 123, is_bot: false },
      chat: { id: 123, type: "private" },
      message: { message_id: 5, text: "codex please", chat: { id: 123, type: "private" } },
      api: {
        sendChatAction: vi.fn(async () => undefined),
        setMessageReaction: vi.fn(async () => true),
      },
      reply: dmReply,
    })

    await bot.messageHandlers.get("message:text")({
      message: {
        message_id: 10,
        text: "we use sqlite here",
        chat: { id: -1001, type: "supergroup" },
        from: { id: 777, is_bot: false, first_name: "Ada" },
      },
      chat: { id: -1001, type: "supergroup" },
      api: {
        sendChatAction: vi.fn(async () => undefined),
        setMessageReaction: vi.fn(async () => true),
      },
      reply: vi.fn(async () => undefined),
    })
    const groupReply = vi.fn(async () => ({
      message_id: 12,
      chat: { id: -1001 },
      text: "custom answer",
    }))
    await bot.messageHandlers.get("message:text")({
      message: {
        message_id: 11,
        text: "Can CODEX    please summarize?",
        chat: { id: -1001, type: "supergroup" },
        from: { id: 778, is_bot: false, first_name: "Grace" },
      },
      chat: { id: -1001, type: "supergroup" },
      api: {
        sendChatAction: vi.fn(async () => undefined),
        setMessageReaction: vi.fn(async () => true),
      },
      reply: groupReply,
    })

    expect(controller.sendPrompt).toHaveBeenCalledTimes(1)
    expect(controller.sendPrompt.mock.calls[0][0].text).toContain("Ada: we use sqlite here")
    expect(groupReply).toHaveBeenCalledWith("custom answer")
  })

  test("group routing can use grammY ctx.me as bot identity", async () => {
    const controller = { sendPrompt: vi.fn(async () => "answer") }
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram({ allowedChatIds: [-1001] }),
      controller,
      groupStore: createMemoryGroupStore({ allowedChatIds: [-1001] }),
      groupMemory: createGroupMemory(),
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })

    await bot.messageHandlers.get("message:text")({
      me: { id: 9001, username: "OpenCodeRemoteBot", first_name: "Khmara" },
      message: {
        message_id: 10,
        text: "Khmara, answer with ctx.me identity",
        chat: { id: -1001, type: "supergroup" },
        from: { id: 777, is_bot: false, first_name: "Ada" },
      },
      chat: { id: -1001, type: "supergroup" },
      api: {
        sendChatAction: vi.fn(async () => undefined),
        setMessageReaction: vi.fn(async () => true),
      },
      reply: vi.fn(async () => ({ message_id: 20, chat: { id: -1001 }, text: "answer" })),
    })

    expect(controller.sendPrompt).toHaveBeenCalledTimes(1)
  })

  test("group reactions to bot messages do not send feedback prompts by default", async () => {
    const controller = {
      sendPrompt: vi.fn(async () => "group answer"),
    }
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram({ allowedChatIds: [-1001] }),
      controller,
      groupStore: createMemoryGroupStore({ allowedChatIds: [-1001] }),
      groupMemory: createGroupMemory(),
      botIdentity: { id: 9001, username: "OpenCodeRemoteBot", firstName: "Khmara" },
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })

    await bot.messageHandlers.get("message:text")({
      message: {
        message_id: 10,
        text: "Khmara, answer this",
        chat: { id: -1001, type: "supergroup" },
        from: { id: 777, is_bot: false, first_name: "Ada" },
      },
      chat: { id: -1001, type: "supergroup" },
      api: {
        sendChatAction: vi.fn(async () => undefined),
        setMessageReaction: vi.fn(async () => true),
      },
      reply: vi.fn(async () => ({ message_id: 20, chat: { id: -1001 }, text: "group answer" })),
    })

    await bot.messageHandlers.get("message_reaction")({
      messageReaction: {
        chat: { id: -1001, type: "supergroup" },
        message_id: 20,
        old_reaction: [],
        new_reaction: [{ type: "emoji", emoji: "👍" }],
      },
      chat: { id: -1001, type: "supergroup" },
      reply: vi.fn(async () => undefined),
    })

    expect(controller.sendPrompt).toHaveBeenCalledTimes(1)
  })

  test("group stickers are passive unless they reply to the bot", async () => {
    const stickerPrompt = {
      prompt: {
        text: "User sent a Telegram sticker.",
        attachments: [{ url: "file:///cache/sticker.webp", mime: "image/webp" }],
      },
      cleanupFiles: [],
      packName: null,
    }
    const createStickerPrompt = vi.fn(async () => stickerPrompt)
    const controller = { sendPrompt: vi.fn(async () => "sticker answer") }
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram({ allowedChatIds: [-1001] }),
      controller,
      groupStore: createMemoryGroupStore({ allowedChatIds: [-1001] }),
      groupMemory: createGroupMemory(),
      botIdentity: { id: 9001, username: "OpenCodeRemoteBot", firstName: "Khmara" },
      createStickerPrompt,
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })
    const reply = vi.fn(async () => ({
      message_id: 30,
      chat: { id: -1001 },
      text: "sticker answer",
    }))

    await bot.messageHandlers.get("message:text")({
      message: {
        message_id: 9,
        text: "this is our current idea",
        chat: { id: -1001, type: "supergroup" },
        from: { id: 777, is_bot: false, first_name: "Ada" },
      },
      chat: { id: -1001, type: "supergroup" },
      api: {
        sendChatAction: vi.fn(async () => undefined),
        setMessageReaction: vi.fn(async () => true),
      },
      reply: vi.fn(async () => undefined),
    })

    await bot.messageHandlers.get("message:sticker")({
      message: {
        message_id: 10,
        sticker: telegramSticker({ set_name: "funny_cats", emoji: "😹" }),
        chat: { id: -1001, type: "supergroup" },
        from: { id: 777, is_bot: false, first_name: "Ada" },
      },
      chat: { id: -1001, type: "supergroup" },
      api: {
        sendChatAction: vi.fn(async () => undefined),
        setMessageReaction: vi.fn(async () => true),
      },
      reply,
    })

    expect(createStickerPrompt).not.toHaveBeenCalled()
    expect(controller.sendPrompt).not.toHaveBeenCalled()

    await bot.messageHandlers.get("message:sticker")({
      message: {
        message_id: 11,
        sticker: telegramSticker({ set_name: "funny_cats", emoji: "😹" }),
        reply_to_message: { message_id: 8, from: { id: 9001, is_bot: true } },
        chat: { id: -1001, type: "supergroup" },
        from: { id: 777, is_bot: false, first_name: "Ada" },
      },
      chat: { id: -1001, type: "supergroup" },
      api: {
        sendChatAction: vi.fn(async () => undefined),
        setMessageReaction: vi.fn(async () => true),
      },
      reply,
    })

    expect(createStickerPrompt).toHaveBeenCalledTimes(1)
    expect(controller.sendPrompt).toHaveBeenCalledTimes(1)
    expect(controller.sendPrompt.mock.calls[0][0].text).toContain("Recent Telegram group context:")
    expect(controller.sendPrompt.mock.calls[0][0].text).toContain("Ada: this is our current idea")
    expect(reply).toHaveBeenCalledWith("sticker answer")
  })

  test("group voice transcripts route only when addressed", async () => {
    const controller = { sendPrompt: vi.fn(async () => "voice answer") }
    const voiceService = {
      isEnabled: vi.fn(() => true),
      transcribe: vi
        .fn()
        .mockResolvedValueOnce("this is passive voice context")
        .mockResolvedValueOnce("Khmara, answer the voice note"),
      shouldSpeak: vi.fn(() => false),
    }
    const downloadVoice = vi.fn(async () => ({
      url: "file:///cache/voice.ogg",
      filePath: "/cache/voice.ogg",
      mime: "audio/ogg",
    }))
    const cleanupMediaAttachments = vi.fn(async () => undefined)
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram({ allowedChatIds: [-1001] }),
      controller,
      voiceService,
      downloadVoice,
      cleanupMediaAttachments,
      groupStore: createMemoryGroupStore({ allowedChatIds: [-1001] }),
      groupMemory: createGroupMemory(),
      botIdentity: { id: 9001, username: "OpenCodeRemoteBot", firstName: "Khmara" },
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })
    const reply = vi.fn(async () => ({ message_id: 30, chat: { id: -1001 }, text: "voice answer" }))

    await bot.messageHandlers.get("message:voice")({
      message: {
        message_id: 10,
        voice: { file_id: "voice-1" },
        chat: { id: -1001, type: "supergroup" },
        from: { id: 777, is_bot: false, first_name: "Ada" },
      },
      chat: { id: -1001, type: "supergroup" },
      api: {
        sendChatAction: vi.fn(async () => undefined),
        setMessageReaction: vi.fn(async () => true),
      },
      reply,
    })

    await bot.messageHandlers.get("message:voice")({
      message: {
        message_id: 11,
        voice: { file_id: "voice-2" },
        chat: { id: -1001, type: "supergroup" },
        from: { id: 777, is_bot: false, first_name: "Ada" },
      },
      chat: { id: -1001, type: "supergroup" },
      api: {
        sendChatAction: vi.fn(async () => undefined),
        setMessageReaction: vi.fn(async () => true),
      },
      reply,
    })

    expect(voiceService.transcribe).toHaveBeenCalledTimes(2)
    expect(controller.sendPrompt).toHaveBeenCalledTimes(1)
    expect(controller.sendPrompt.mock.calls[0][0].text).toContain(
      "Ada: this is passive voice context",
    )
    expect(controller.sendPrompt.mock.calls[0][0].text).toContain("Khmara, answer the voice note")
    expect(reply).toHaveBeenCalledTimes(1)
    expect(cleanupMediaAttachments).toHaveBeenCalledTimes(2)
  })

  test("group photos are passive unless captions address the bot", async () => {
    const controller = { sendPrompt: vi.fn(async () => "photo answer") }
    const downloadPhoto = vi.fn(async () => ({
      url: "file:///cache/photo.jpg",
      filePath: "/cache/photo.jpg",
      mime: "image/jpeg",
    }))
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram({ allowedChatIds: [-1001] }),
      controller,
      downloadPhoto,
      cleanupMediaAttachments: vi.fn(async () => undefined),
      groupStore: createMemoryGroupStore({ allowedChatIds: [-1001] }),
      groupMemory: createGroupMemory(),
      botIdentity: { id: 9001, username: "OpenCodeRemoteBot", firstName: "Khmara" },
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })
    const photo = [
      { file_id: "small", width: 100, height: 100 },
      { file_id: "large", width: 500, height: 500 },
    ]
    const reply = vi.fn(async () => ({ message_id: 30, chat: { id: -1001 }, text: "photo answer" }))

    await bot.messageHandlers.get("message:photo")({
      message: {
        message_id: 10,
        photo,
        chat: { id: -1001, type: "supergroup" },
        from: { id: 777, is_bot: false, first_name: "Ada" },
      },
      chat: { id: -1001, type: "supergroup" },
      api: {
        sendChatAction: vi.fn(async () => undefined),
        setMessageReaction: vi.fn(async () => true),
      },
      reply,
    })

    expect(downloadPhoto).not.toHaveBeenCalled()
    expect(controller.sendPrompt).not.toHaveBeenCalled()

    await bot.messageHandlers.get("message:photo")({
      message: {
        message_id: 11,
        caption: "Khmara, inspect this photo",
        photo,
        chat: { id: -1001, type: "supergroup" },
        from: { id: 777, is_bot: false, first_name: "Ada" },
      },
      chat: { id: -1001, type: "supergroup" },
      api: {
        sendChatAction: vi.fn(async () => undefined),
        setMessageReaction: vi.fn(async () => true),
      },
      reply,
    })

    expect(downloadPhoto).toHaveBeenCalledTimes(1)
    expect(controller.sendPrompt).toHaveBeenCalledTimes(1)
    expect(controller.sendPrompt.mock.calls[0][0].text).toContain("Khmara, inspect this photo")
    expect(reply).toHaveBeenCalledWith("photo answer")
  })

  test("text prompts strip tool usage announcements from the final answer", async () => {
    const controller = {
      sendPrompt: vi.fn(async (_prompt, options) => {
        await options.onProgress({
          type: "tool.updated",
          partId: "part_1",
          tool: "skill_view",
          title: "brainstorming",
        })
        return 'Використовую "brainstorming".\nОсь відповідь користувачу.'
      }),
    }
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram(),
      controller,
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
      progressVerbosity: "all",
      progressEditThrottleMs: 0,
    })
    const reply = vi.fn(async (text) => ({
      message_id: text.startsWith("Activity") ? 20 : 21,
      chat: { id: 456 },
      text,
    }))

    await bot.messageHandlers.get("message:text")({
      message: { message_id: 10, text: "hello", chat: { id: 456 } },
      api: {
        sendChatAction: vi.fn(async () => undefined),
        setMessageReaction: vi.fn(async () => true),
        editMessageText: vi.fn(async () => true),
      },
      reply,
    })

    expect(reply).toHaveBeenCalledWith("Activity\n📚 skill_view: brainstorming")
    expect(reply).toHaveBeenCalledWith("Ось відповідь користувачу.")
    expect(reply).not.toHaveBeenCalledWith(expect.stringContaining("Використовую"))
  })

  test("text prompts keep regular answers that start with using", async () => {
    const controller = {
      sendPrompt: vi.fn(
        async () => "Using `Array.map` is fine here.\nKeep the transformation local.",
      ),
    }
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram(),
      controller,
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })
    const reply = vi.fn(async (text) => ({ message_id: 11, chat: { id: 456 }, text }))

    await bot.messageHandlers.get("message:text")({
      message: { message_id: 10, text: "hello", chat: { id: 456 } },
      api: {
        sendChatAction: vi.fn(async () => undefined),
        setMessageReaction: vi.fn(async () => true),
      },
      reply,
    })

    expect(reply).toHaveBeenCalledWith(
      "Using `Array.map` is fine here.\nKeep the transformation local.",
    )
  })

  test("text prompts use persisted verbose progress setting", async () => {
    const controller = {
      getProgressVerbosity: vi.fn(async () => "verbose"),
      sendPrompt: vi.fn(async (_prompt, options) => {
        await options.onProgress({
          type: "tool.updated",
          partId: "part_1",
          tool: "bash",
          input: { command: "pnpm test" },
        })
        return "answer"
      }),
    }
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram(),
      controller,
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
      progressVerbosity: "off",
      progressEditThrottleMs: 0,
    })
    const reply = vi.fn(async (text) => ({ message_id: 20, chat: { id: 456 }, text }))

    await bot.messageHandlers.get("message:text")({
      message: { message_id: 10, text: "hello", chat: { id: 456 } },
      api: {
        sendChatAction: vi.fn(async () => undefined),
        setMessageReaction: vi.fn(async () => true),
        editMessageText: vi.fn(async () => true),
      },
      reply,
    })

    expect(controller.getProgressVerbosity).toHaveBeenCalled()
    expect(reply).toHaveBeenCalledWith('Activity\n💻 bash - {"command":"pnpm test"}')
    expect(reply).toHaveBeenCalledWith("answer")
  })

  test("progress message send failures do not block the final answer", async () => {
    const controller = {
      sendPrompt: vi.fn(async (_prompt, options) => {
        await options.onProgress({
          type: "tool.updated",
          partId: "part_1",
          tool: "bash",
        })
        return "answer"
      }),
    }
    const logger = { warn: vi.fn(), error: vi.fn() }
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram(),
      controller,
      logger,
      botFactory: FakeBot,
      progressVerbosity: "all",
      progressEditThrottleMs: 0,
    })
    const reply = vi
      .fn()
      .mockRejectedValueOnce(new Error("progress failed"))
      .mockResolvedValueOnce({ message_id: 21, chat: { id: 456 }, text: "answer" })

    await bot.messageHandlers.get("message:text")({
      message: { message_id: 10, text: "hello", chat: { id: 456 } },
      api: {
        sendChatAction: vi.fn(async () => undefined),
        setMessageReaction: vi.fn(async () => true),
        editMessageText: vi.fn(async () => true),
      },
      reply,
    })

    expect(reply).toHaveBeenCalledWith("answer")
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.any(Error) }),
      "Could not send Telegram progress message",
    )
  })

  test("progress message edit failures do not block the final answer", async () => {
    const controller = {
      sendPrompt: vi.fn(async (_prompt, options) => {
        await options.onProgress({
          type: "tool.updated",
          partId: "part_1",
          tool: "skill_view",
          title: "brainstorming",
        })
        await options.onProgress({
          type: "tool.updated",
          partId: "part_2",
          tool: "bash",
        })
        return "answer"
      }),
    }
    const logger = { warn: vi.fn(), error: vi.fn() }
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram(),
      controller,
      logger,
      botFactory: FakeBot,
      progressVerbosity: "all",
      progressEditThrottleMs: 0,
    })
    const reply = vi.fn(async (text) => ({
      message_id: text.startsWith("Activity") ? 20 : 21,
      chat: { id: 456 },
      text,
    }))
    const editMessageText = vi.fn(async () => {
      throw new Error("edit failed")
    })

    await bot.messageHandlers.get("message:text")({
      message: { message_id: 10, text: "hello", chat: { id: 456 } },
      api: {
        sendChatAction: vi.fn(async () => undefined),
        setMessageReaction: vi.fn(async () => true),
        editMessageText,
      },
      reply,
    })

    expect(reply).toHaveBeenCalledWith("answer")
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.any(Error) }),
      "Could not edit Telegram progress message",
    )
  })

  test("text prompts tell OpenCode how to request Telegram reactions", async () => {
    const controller = {
      sendPrompt: vi.fn(async () => "answer"),
    }
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram(),
      controller,
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })

    await bot.messageHandlers.get("message:text")({
      message: {
        message_id: 10,
        text: "hello",
        chat: { id: 456 },
        from: { id: 123, is_bot: false, first_name: "Authorized", last_name: "User" },
      },
      api: {
        sendChatAction: vi.fn(async () => undefined),
        setMessageReaction: vi.fn(async () => true),
      },
      reply: vi.fn(async () => ({ message_id: 11, chat: { id: 456 }, text: "answer" })),
    })

    expect(controller.sendPrompt).toHaveBeenCalledWith(
      {
        text: [
          "hello",
          "",
          "Telegram gateway note:",
          "The gateway shows tool and skill usage separately in an Activity message. Do not include tool or skill usage announcements in your final response.",
          "If a short emoji reaction to the user's message is appropriate, include exactly one hidden marker anywhere in your response:",
          "[telegram_reaction: 👍]",
          "Use only one standard Telegram emoji, and omit the marker when no reaction is useful. The marker will be removed before the user sees the reply.",
        ].join("\n"),
        author: { name: "Authorized User", source: "sender" },
      },
      expect.objectContaining({ onProgress: expect.any(Function) }),
    )
  })

  test("text prompts tell OpenCode how to request saved sticker replies", async () => {
    const stickerStore = createMemoryStickerStore()
    await stickerStore.savePack({
      name: "funny_cats",
      stickers: [
        {
          fileUniqueId: "cat-1",
          fileId: "file-secret-cat",
          packName: "funny_cats",
          emoji: "😹",
          kind: "static",
        },
      ],
    })
    await stickerStore.updateStickerDescription("cat-1", "laughing orange cat")
    const controller = {
      sendPrompt: vi.fn(async () => "answer"),
    }
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram(),
      controller,
      stickerStore,
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })

    await bot.messageHandlers.get("message:text")({
      message: {
        message_id: 10,
        text: "send me a sticker",
        chat: { id: 456 },
        from: { id: 123, is_bot: false, first_name: "Authorized", last_name: "User" },
      },
      api: {
        sendChatAction: vi.fn(async () => undefined),
        setMessageReaction: vi.fn(async () => true),
      },
      reply: vi.fn(async () => ({ message_id: 11, chat: { id: 456 }, text: "answer" })),
    })

    const prompt = controller.sendPrompt.mock.calls[0][0]
    expect(prompt.text).toContain("If the user explicitly asks for a sticker")
    expect(prompt.text).toContain("[telegram_sticker: 😹]")
    expect(prompt.text).toContain("[telegram_sticker: any]")
    expect(prompt.text).toContain("funny_cats")
    expect(prompt.text).toContain("😹")
    expect(prompt.text).toContain("laughing orange cat")
    expect(prompt.text).not.toContain("file-secret-cat")
  })

  test("hidden telegram reaction markers are stripped and applied to the user message", async () => {
    const controller = {
      sendPrompt: vi.fn(async () => "Nice idea.\n[telegram_reaction: 👍]"),
    }
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram(),
      controller,
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })
    const reply = vi.fn(async () => ({ message_id: 11, chat: { id: 456 }, text: "Nice idea." }))
    const sendChatAction = vi.fn(async () => undefined)
    const setMessageReaction = vi.fn(async () => true)

    await bot.messageHandlers.get("message:text")({
      message: { message_id: 10, text: "hello", chat: { id: 456 } },
      api: { sendChatAction, setMessageReaction },
      reply,
    })

    expect(reply).toHaveBeenCalledWith("Nice idea.")
    expect(setMessageReaction).toHaveBeenNthCalledWith(1, 456, 10, [{ type: "emoji", emoji: "👀" }])
    expect(setMessageReaction).toHaveBeenNthCalledWith(2, 456, 10, [])
    expect(setMessageReaction).toHaveBeenNthCalledWith(3, 456, 10, [{ type: "emoji", emoji: "👍" }])
  })

  test("hidden telegram sticker markers are stripped and send matching saved stickers", async () => {
    const stickerStore = createMemoryStickerStore()
    await stickerStore.savePack({
      name: "funny_cats",
      stickers: [
        {
          fileUniqueId: "cat-1",
          fileId: "cat-file-id",
          packName: "funny_cats",
          emoji: "😹",
          kind: "static",
        },
        {
          fileUniqueId: "ok-1",
          fileId: "ok-file-id",
          packName: "funny_cats",
          emoji: "👍",
          kind: "static",
        },
      ],
    })
    const controller = {
      sendPrompt: vi.fn(async () => "Here you go.\n[telegram_sticker: 😹]"),
    }
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram(),
      controller,
      stickerStore,
      random: vi.fn(() => 0),
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })
    const reply = vi.fn(async () => ({ message_id: 11, chat: { id: 456 }, text: "Here you go." }))
    const replyWithSticker = vi.fn(async () => ({ message_id: 12, chat: { id: 456 } }))
    const setMessageReaction = vi.fn(async () => true)

    await bot.messageHandlers.get("message:text")({
      message: { message_id: 10, text: "send sticker", chat: { id: 456 } },
      api: { sendChatAction: vi.fn(async () => undefined), setMessageReaction },
      reply,
      replyWithSticker,
    })

    expect(reply).toHaveBeenCalledWith("Here you go.")
    expect(replyWithSticker).toHaveBeenCalledWith("cat-file-id")
    expect(setMessageReaction).toHaveBeenNthCalledWith(1, 456, 10, [{ type: "emoji", emoji: "👀" }])
    expect(setMessageReaction).toHaveBeenNthCalledWith(2, 456, 10, [])
    expect(setMessageReaction).toHaveBeenCalledTimes(2)
  })

  test("any telegram sticker marker sends a saved sticker without empty text", async () => {
    const stickerStore = createMemoryStickerStore()
    await stickerStore.savePack({
      name: "funny_cats",
      stickers: [
        {
          fileUniqueId: "cat-1",
          fileId: "cat-file-id",
          packName: "funny_cats",
          emoji: "😹",
          kind: "static",
        },
      ],
    })
    const controller = {
      sendPrompt: vi.fn(async () => "[telegram_sticker: any]"),
    }
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram(),
      controller,
      stickerStore,
      random: vi.fn(() => 0),
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })
    const reply = vi.fn(async () => ({ message_id: 11, chat: { id: 456 }, text: "" }))
    const replyWithSticker = vi.fn(async () => ({ message_id: 12, chat: { id: 456 } }))

    await bot.messageHandlers.get("message:text")({
      message: { message_id: 10, text: "send sticker", chat: { id: 456 } },
      api: {
        sendChatAction: vi.fn(async () => undefined),
        setMessageReaction: vi.fn(async () => true),
      },
      reply,
      replyWithSticker,
    })

    expect(reply).not.toHaveBeenCalled()
    expect(replyWithSticker).toHaveBeenCalledWith("cat-file-id")
  })

  test("telegram sticker markers can select saved stickers by description", async () => {
    const stickerStore = createMemoryStickerStore()
    await stickerStore.savePack({
      name: "funny_cats",
      stickers: [
        {
          fileUniqueId: "cat-1",
          fileId: "cat-file-id",
          packName: "funny_cats",
          emoji: "😹",
          kind: "static",
        },
        {
          fileUniqueId: "duck-1",
          fileId: "duck-file-id",
          packName: "funny_cats",
          emoji: "😹",
          kind: "static",
        },
      ],
    })
    await stickerStore.updateStickerDescription("cat-1", "laughing orange cat")
    await stickerStore.updateStickerDescription("duck-1", "thumbs up duck")
    const controller = {
      sendPrompt: vi.fn(async () => "[telegram_sticker: thumbs up duck]"),
    }
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram(),
      controller,
      stickerStore,
      random: vi.fn(() => 0),
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })
    const replyWithSticker = vi.fn(async () => ({ message_id: 12, chat: { id: 456 } }))

    await bot.messageHandlers.get("message:text")({
      message: { message_id: 10, text: "send duck sticker", chat: { id: 456 } },
      api: {
        sendChatAction: vi.fn(async () => undefined),
        setMessageReaction: vi.fn(async () => true),
      },
      reply: vi.fn(async () => ({ message_id: 11, chat: { id: 456 }, text: "" })),
      replyWithSticker,
    })

    expect(replyWithSticker).toHaveBeenCalledWith("duck-file-id")
  })

  test("sticker messages send visual sticker prompts and offer to save unsaved packs", async () => {
    const attachment = {
      mime: "image/webp",
      url: "file:///cache/sticker.webp",
      filePath: "/cache/sticker.webp",
    }
    const controller = {
      sendPrompt: vi.fn(async () => "sticker answer"),
    }
    const stickerStore = createMemoryStickerStore()
    const createStickerPrompt = vi.fn(async () => ({
      prompt: { text: "Sticker prompt", attachments: [attachment] },
      packName: "funny_cats",
      cleanupFiles: ["/tmp/source.webp"],
    }))
    const cleanupStickerFiles = vi.fn(async () => undefined)
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram(),
      controller,
      stickerStore,
      createStickerPrompt,
      cleanupStickerFiles,
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })
    const reply = vi.fn(async (text) => ({ message_id: 20, chat: { id: 456 }, text }))

    await bot.messageHandlers.get("message:sticker")({
      message: {
        message_id: 10,
        chat: { id: 456 },
        from: { id: 123, is_bot: false, first_name: "Authorized", last_name: "User" },
        sticker: telegramSticker({ set_name: "funny_cats" }),
      },
      api: { sendChatAction: vi.fn(async () => undefined) },
      reply,
    })

    expect(createStickerPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        token: "token",
        sticker: expect.objectContaining({ file_id: "file-static" }),
      }),
    )
    expect(controller.sendPrompt).toHaveBeenCalledWith(
      {
        text: expect.stringContaining("Sticker prompt"),
        attachments: [attachment],
        author: { name: "Authorized User", source: "sender" },
      },
      expect.objectContaining({ onProgress: expect.any(Function) }),
    )
    expect(reply).toHaveBeenCalledWith("sticker answer")
    expect(reply).toHaveBeenCalledWith(
      "Sticker pack funny_cats is not saved. Save it for future sticker replies?",
      expect.objectContaining({ reply_markup: expect.any(Object) }),
    )
    expect(cleanupStickerFiles).toHaveBeenCalledWith(["/tmp/source.webp"], expect.any(Object))
  })

  test("stickers save command saves the replied sticker pack", async () => {
    const stickerStore = createMemoryStickerStore()
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram(),
      controller: {},
      stickerStore,
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })
    const reply = vi.fn(async (text) => ({ message_id: 11, chat: { id: 456 }, text }))

    await bot.commands.get("stickers")({
      message: {
        text: "/stickers save",
        reply_to_message: { sticker: telegramSticker({ set_name: "funny_cats" }) },
      },
      api: {
        getStickerSet: vi.fn(async () => ({
          name: "funny_cats",
          stickers: [telegramSticker({ file_unique_id: "one" })],
        })),
      },
      reply,
    })

    expect(await stickerStore.listPacks()).toEqual([
      { name: "funny_cats", stickerCount: 1, emojis: ["😹"] },
    ])
    expect(reply).toHaveBeenCalledWith("Saved sticker pack funny_cats (1 sticker).")
  })

  test("stickers save command rejects stickers without a pack name safely", async () => {
    const stickerStore = createMemoryStickerStore()
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram(),
      controller: {},
      stickerStore,
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })
    const reply = vi.fn(async (text) => ({ message_id: 11, chat: { id: 456 }, text }))

    await bot.commands.get("stickers")({
      message: {
        text: "/stickers save",
        reply_to_message: { sticker: telegramSticker({ set_name: undefined }) },
      },
      api: { getStickerSet: vi.fn() },
      reply,
    })

    expect(reply).toHaveBeenCalledWith("That sticker does not belong to a saveable sticker pack.")
    expect(await stickerStore.listPacks()).toEqual([])
  })

  test("stickers list and forget manage saved packs", async () => {
    const stickerStore = createMemoryStickerStore()
    await stickerStore.savePack({
      name: "funny_cats",
      stickers: [
        {
          fileUniqueId: "one",
          fileId: "file-one",
          packName: "funny_cats",
          emoji: "😹",
          kind: "static",
        },
      ],
    })
    const cleanupStickerFiles = vi.fn(async () => undefined)
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram(),
      controller: {},
      stickerStore,
      cleanupStickerFiles,
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })
    const reply = vi.fn(async (text) => ({ message_id: 11, chat: { id: 456 }, text }))

    await bot.commands.get("stickers")({ message: { text: "/stickers list" }, reply })
    await bot.commands.get("stickers")({ message: { text: "/stickers forget funny_cats" }, reply })

    expect(reply).toHaveBeenCalledWith("Saved sticker packs:\n- funny_cats (1 sticker, 😹)")
    expect(reply).toHaveBeenCalledWith("Forgot sticker pack funny_cats.")
    expect(await stickerStore.listPacks()).toEqual([])
  })

  test("saved stickers can replace requested emoji reactions", async () => {
    const stickerStore = createMemoryStickerStore()
    await stickerStore.savePack({
      name: "ok_pack",
      stickers: [
        {
          fileUniqueId: "ok-1",
          fileId: "sticker-file-id",
          packName: "ok_pack",
          emoji: "👍",
          kind: "static",
        },
      ],
    })
    const controller = {
      sendPrompt: vi.fn(async () => "Nice.\n[telegram_reaction: 👍]"),
    }
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram(),
      controller,
      stickerStore,
      random: vi.fn(() => 0),
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })
    const reply = vi.fn(async () => ({ message_id: 11, chat: { id: 456 }, text: "Nice." }))
    const replyWithSticker = vi.fn(async () => ({ message_id: 12, chat: { id: 456 } }))
    const setMessageReaction = vi.fn(async () => true)

    await bot.messageHandlers.get("message:text")({
      message: { message_id: 10, text: "hello", chat: { id: 456 } },
      api: { sendChatAction: vi.fn(async () => undefined), setMessageReaction },
      reply,
      replyWithSticker,
    })

    expect(reply).toHaveBeenCalledWith("Nice.")
    expect(replyWithSticker).toHaveBeenCalledWith("sticker-file-id")
    expect(setMessageReaction).toHaveBeenNthCalledWith(1, 456, 10, [{ type: "emoji", emoji: "👀" }])
    expect(setMessageReaction).toHaveBeenNthCalledWith(2, 456, 10, [])
    expect(setMessageReaction).toHaveBeenCalledTimes(2)
  })

  test("missing sticker send APIs fall back to emoji reactions", async () => {
    const stickerStore = createMemoryStickerStore()
    await stickerStore.savePack({
      name: "ok_pack",
      stickers: [
        {
          fileUniqueId: "ok-1",
          fileId: "sticker-file-id",
          packName: "ok_pack",
          emoji: "👍",
          kind: "static",
        },
      ],
    })
    const controller = {
      sendPrompt: vi.fn(async () => "Nice.\n[telegram_reaction: 👍]"),
    }
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram(),
      controller,
      stickerStore,
      random: vi.fn(() => 0),
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })
    const reply = vi.fn(async () => ({ message_id: 11, chat: { id: 456 }, text: "Nice." }))
    const setMessageReaction = vi.fn(async () => true)

    await bot.messageHandlers.get("message:text")({
      message: { message_id: 10, text: "hello", chat: { id: 456 } },
      api: { sendChatAction: vi.fn(async () => undefined), setMessageReaction },
      reply,
    })

    expect(setMessageReaction).toHaveBeenNthCalledWith(3, 456, 10, [{ type: "emoji", emoji: "👍" }])
  })

  test("single photo messages send one image prompt and one response", async () => {
    const attachment = {
      mime: "image/jpeg",
      url: "file:///tmp/photo-large.jpg",
      filePath: "/tmp/photo-large.jpg",
    }
    const controller = {
      sendPrompt: vi.fn(async () => "image answer"),
    }
    const logger = { warn: vi.fn(), error: vi.fn() }
    const downloadPhoto = vi.fn(async () => attachment)
    const cleanupMediaAttachments = vi.fn(async () => undefined)
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram(),
      controller,
      logger,
      botFactory: FakeBot,
      downloadPhoto,
      cleanupMediaAttachments,
    })
    const reply = vi.fn(async (text) => ({ message_id: 20, chat: { id: 456 }, text }))
    const small = { file_id: "small", width: 320, height: 180, file_size: 1000 }
    const large = { file_id: "large", width: 1280, height: 720, file_size: 3000 }

    await bot.messageHandlers.get("message:photo")({
      message: {
        message_id: 10,
        chat: { id: 456 },
        caption: "What changed?",
        from: { id: 123, is_bot: false, first_name: "Forwarder" },
        forward_origin: {
          type: "hidden_user",
          sender_user_name: "Screenshot Author",
        },
        photo: [small, large],
      },
      api: { sendChatAction: vi.fn(async () => undefined) },
      reply,
    })

    expect(downloadPhoto).toHaveBeenCalledWith({
      api: { sendChatAction: expect.any(Function) },
      token: "token",
      photo: large,
      directory: undefined,
    })
    expect(controller.sendPrompt).toHaveBeenCalledWith(
      {
        text: expect.stringContaining(
          "The gateway shows tool and skill usage separately in an Activity message.",
        ),
        author: { name: "Screenshot Author", source: "forwarded" },
        attachments: [attachment],
      },
      expect.objectContaining({ onProgress: expect.any(Function) }),
    )
    expect(reply).toHaveBeenCalledTimes(1)
    expect(reply).toHaveBeenCalledWith("image answer")
    expect(cleanupMediaAttachments).toHaveBeenCalledWith([attachment], logger)
  })

  test("photo prompts in voice all mode send voice replies without text", async () => {
    const attachment = {
      mime: "image/jpeg",
      url: "file:///tmp/photo-large.jpg",
      filePath: "/tmp/photo-large.jpg",
    }
    const controller = {
      sendPrompt: vi.fn(async () => "image answer"),
    }
    const voiceService = {
      shouldSpeak: vi.fn(() => true),
      synthesizeTelegramVoice: vi.fn(async () => ({ filePath: "/cache/reply.ogg" })),
    }
    const downloadPhoto = vi.fn(async () => attachment)
    const sendVoice = vi.fn(async () => ({ message_id: 12, chat: { id: 456 } }))
    const cleanupMediaAttachments = vi.fn(async () => undefined)
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram(),
      controller,
      voiceService,
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
      downloadPhoto,
      sendVoice,
      cleanupMediaAttachments,
    })
    const reply = vi.fn(async (text) => ({ message_id: 20, chat: { id: 456 }, text }))
    const large = { file_id: "large", width: 1280, height: 720, file_size: 3000 }

    await bot.messageHandlers.get("message:photo")({
      message: {
        message_id: 10,
        chat: { id: 456 },
        caption: "What changed?",
        photo: [large],
      },
      api: { sendChatAction: vi.fn(async () => undefined) },
      reply,
    })

    expect(reply).not.toHaveBeenCalled()
    expect(voiceService.shouldSpeak).toHaveBeenCalledWith({ source: "photo" })
    expect(voiceService.synthesizeTelegramVoice).toHaveBeenCalledWith("image answer")
    expect(sendVoice).toHaveBeenCalledWith({
      ctx: expect.objectContaining({ reply }),
      filePath: "/cache/reply.ogg",
    })
    expect(cleanupMediaAttachments).toHaveBeenCalledWith([attachment], expect.any(Object))
  })

  test("voice messages are transcribed and answered with voice only", async () => {
    const voiceAttachment = { mime: "audio/ogg", filePath: "/tmp/voice.ogg" }
    const controller = {
      sendPrompt: vi.fn(async () => "voice answer"),
    }
    const voiceService = {
      isEnabled: vi.fn(() => true),
      transcribe: vi.fn(async () => "transcribed prompt"),
      shouldSpeak: vi.fn(() => true),
      synthesizeTelegramVoice: vi.fn(async () => ({ filePath: "/cache/reply.ogg" })),
    }
    const downloadVoice = vi.fn(async () => voiceAttachment)
    const sendVoice = vi.fn(async () => ({ message_id: 12, chat: { id: 456 } }))
    const cleanupMediaAttachments = vi.fn(async () => undefined)
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram(),
      controller,
      voiceService,
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
      downloadVoice,
      sendVoice,
      cleanupMediaAttachments,
    })
    const reply = vi.fn(async (text) => ({ message_id: 11, chat: { id: 456 }, text }))

    await bot.messageHandlers.get("message:voice")({
      message: {
        message_id: 10,
        chat: { id: 456 },
        from: { id: 123, is_bot: false, first_name: "Authorized", last_name: "User" },
        voice: { file_id: "voice-1" },
      },
      api: { sendChatAction: vi.fn(async () => undefined) },
      reply,
    })

    expect(downloadVoice).toHaveBeenCalledWith({
      api: { sendChatAction: expect.any(Function) },
      token: "token",
      voice: { file_id: "voice-1" },
      directory: undefined,
    })
    expect(voiceService.transcribe).toHaveBeenCalledWith("/tmp/voice.ogg")
    expect(controller.sendPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("transcribed prompt"),
        author: { name: "Authorized User", source: "sender" },
      }),
      expect.objectContaining({ onProgress: expect.any(Function) }),
    )
    expect(reply).not.toHaveBeenCalled()
    expect(voiceService.shouldSpeak).toHaveBeenCalledWith({ source: "voice" })
    expect(sendVoice).toHaveBeenCalledWith({
      ctx: expect.objectContaining({ reply }),
      filePath: "/cache/reply.ogg",
    })
    expect(cleanupMediaAttachments).toHaveBeenCalledWith([voiceAttachment], expect.any(Object))
  })

  test("photo albums send one prompt with all photos and one response", async () => {
    vi.useFakeTimers()
    const controller = {
      sendPrompt: vi.fn(async () => "album answer"),
    }
    const logger = { warn: vi.fn(), error: vi.fn() }
    const downloadPhoto = vi.fn(async ({ photo }) => ({
      mime: "image/jpeg",
      url: `file:///tmp/${photo.file_id}.jpg`,
      filePath: `/tmp/${photo.file_id}.jpg`,
    }))
    const cleanupMediaAttachments = vi.fn(async () => undefined)
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram(),
      controller,
      logger,
      botFactory: FakeBot,
      mediaGroupWaitMs: 10,
      downloadPhoto,
      cleanupMediaAttachments,
    })
    const reply = vi.fn(async (text) => ({ message_id: 20, chat: { id: 456 }, text }))
    const handler = bot.messageHandlers.get("message:photo")

    await handler(photoContext({ messageId: 12, fileId: "photo-12", reply }))
    await handler(
      photoContext({
        messageId: 10,
        fileId: "photo-10",
        caption: "Compare these screenshots",
        reply,
      }),
    )
    await handler(photoContext({ messageId: 11, fileId: "photo-11", reply }))

    expect(controller.sendPrompt).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(10)

    expect(controller.sendPrompt).toHaveBeenCalledTimes(1)
    expect(controller.sendPrompt).toHaveBeenCalledWith(
      {
        text: expect.stringContaining(
          "The gateway shows tool and skill usage separately in an Activity message.",
        ),
        author: { name: "Authorized User", source: "sender" },
        attachments: [
          { mime: "image/jpeg", url: "file:///tmp/photo-10.jpg", filePath: "/tmp/photo-10.jpg" },
          { mime: "image/jpeg", url: "file:///tmp/photo-11.jpg", filePath: "/tmp/photo-11.jpg" },
          { mime: "image/jpeg", url: "file:///tmp/photo-12.jpg", filePath: "/tmp/photo-12.jpg" },
        ],
      },
      expect.objectContaining({ onProgress: expect.any(Function) }),
    )
    expect(reply).toHaveBeenCalledTimes(1)
    expect(reply).toHaveBeenCalledWith("album answer")
    expect(cleanupMediaAttachments).toHaveBeenCalledTimes(1)
  })

  test("photo album failures send a safe reply and clean up media", async () => {
    vi.useFakeTimers()
    const attachment = {
      mime: "image/jpeg",
      url: "file:///tmp/photo-10.jpg",
      filePath: "/tmp/photo-10.jpg",
    }
    const controller = {
      sendPrompt: vi.fn(async () => {
        throw new Error("provider secret")
      }),
    }
    const logger = { warn: vi.fn(), error: vi.fn() }
    const cleanupMediaAttachments = vi.fn(async () => undefined)
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram(),
      controller,
      logger,
      botFactory: FakeBot,
      mediaGroupWaitMs: 10,
      downloadPhoto: vi.fn(async () => attachment),
      cleanupMediaAttachments,
    })
    const reply = vi.fn(async (text) => ({ message_id: 20, chat: { id: 456 }, text }))

    await bot.messageHandlers.get("message:photo")(
      photoContext({
        messageId: 10,
        fileId: "photo-10",
        caption: "What is wrong here?",
        reply,
      }),
    )
    await vi.advanceTimersByTimeAsync(10)

    expect(reply).toHaveBeenCalledWith("OpenCode Remote failed while handling that request.")
    expect(logger.error).toHaveBeenCalled()
    expect(cleanupMediaAttachments).toHaveBeenCalledWith([attachment], logger)
  })

  test("user reaction to a known bot message sends a feedback prompt and reply", async () => {
    const controller = {
      sendPrompt: vi.fn(async (prompt) => {
        if (String(prompt?.text ?? prompt).startsWith("hello")) {
          return "answer"
        }
        return "feedback response"
      }),
    }
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram(),
      controller,
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })
    const reply = vi.fn(async (text) => ({ message_id: 11, chat: { id: 456 }, text }))
    const setMessageReaction = vi.fn(async () => true)

    await bot.messageHandlers.get("message:text")({
      message: { message_id: 10, text: "hello", chat: { id: 456 } },
      api: { sendChatAction: vi.fn(async () => undefined), setMessageReaction },
      reply,
    })

    const feedbackReply = vi.fn(async (text) => ({ message_id: 12, chat: { id: 456 }, text }))

    await bot.messageHandlers.get("message_reaction")({
      messageReaction: {
        chat: { id: 456 },
        message_id: 11,
        old_reaction: [],
        new_reaction: [{ type: "emoji", emoji: "👍" }],
      },
      reply: feedbackReply,
    })

    expect(controller.sendPrompt).toHaveBeenNthCalledWith(
      2,
      [
        "User reacted to one of your Telegram bot messages with 👍.",
        "",
        "Bot message:",
        "answer",
        "",
        "Telegram gateway note:",
        "The gateway shows tool and skill usage separately in an Activity message. Do not include tool or skill usage announcements in your final response.",
        "If a short emoji reaction to the user's message is appropriate, include exactly one hidden marker anywhere in your response:",
        "[telegram_reaction: 👍]",
        "Use only one standard Telegram emoji, and omit the marker when no reaction is useful. The marker will be removed before the user sees the reply.",
      ].join("\n"),
      expect.objectContaining({ onProgress: expect.any(Function) }),
    )
    expect(feedbackReply).toHaveBeenCalledWith("feedback response")
  })

  test("user reaction to an unknown bot message does nothing", async () => {
    const controller = {
      sendPrompt: vi.fn(async () => "answer"),
    }
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram(),
      controller,
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })

    await bot.messageHandlers.get("message_reaction")({
      messageReaction: {
        chat: { id: 456 },
        message_id: 999,
        old_reaction: [],
        new_reaction: [{ type: "emoji", emoji: "👍" }],
      },
      reply: vi.fn(async () => undefined),
    })

    expect(controller.sendPrompt).not.toHaveBeenCalled()
  })

  test("bot message memory evicts older messages", async () => {
    const controller = {
      sendPrompt: vi.fn(async (prompt) => `answer ${prompt}`),
    }
    const bot = createTelegramBot({
      token: "token",
      telegram: testTelegram(),
      controller,
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })
    let nextReplyId = 100
    const reply = vi.fn(async (text) => ({ message_id: nextReplyId++, chat: { id: 456 }, text }))

    for (let index = 0; index < 201; index += 1) {
      await bot.messageHandlers.get("message:text")({
        message: { message_id: index + 1, text: String(index), chat: { id: 456 } },
        api: {
          sendChatAction: vi.fn(async () => undefined),
          setMessageReaction: vi.fn(async () => true),
        },
        reply,
      })
    }

    await bot.messageHandlers.get("message_reaction")({
      messageReaction: {
        chat: { id: 456 },
        message_id: 100,
        old_reaction: [],
        new_reaction: [{ type: "emoji", emoji: "👍" }],
      },
      reply: vi.fn(async () => undefined),
    })

    expect(controller.sendPrompt).toHaveBeenCalledTimes(201)
  })
})

function photoContext({ messageId, fileId, caption = "", reply }) {
  return {
    message: {
      message_id: messageId,
      chat: { id: 456 },
      from: { id: 123, is_bot: false, first_name: "Authorized", last_name: "User" },
      media_group_id: "album-1",
      caption,
      photo: [{ file_id: fileId, width: 1280, height: 720, file_size: 3000 }],
    },
    api: { sendChatAction: vi.fn(async () => undefined) },
    reply,
  }
}

function telegramSticker(overrides = {}) {
  return {
    file_id: "file-static",
    file_unique_id: "unique-static",
    width: 512,
    height: 512,
    file_size: 100,
    emoji: "😹",
    set_name: "funny_cats",
    is_animated: false,
    is_video: false,
    ...overrides,
  }
}
