import { afterEach, describe, expect, test, vi } from "vitest"
import { createTelegramBot } from "../../src/adapters/telegram/bot.js"

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

describe("createTelegramBot", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  test("registers v1 command handlers and message handlers", () => {
    const bot = createTelegramBot({
      token: "token",
      allowedUserId: 123,
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
    ])
    expect(bot.messageHandlers.has("message:text")).toBe(true)
    expect(bot.messageHandlers.has("message:photo")).toBe(true)
    expect(bot.messageHandlers.has("message:voice")).toBe(true)
    expect(bot.messageHandlers.has("message_reaction")).toBe(true)
    expect(bot.errorHandler).toEqual(expect.any(Function))
    expect(bot.api.setMyCommands).not.toHaveBeenCalled()
  })

  test("status command reports progress verbosity", async () => {
    const bot = createTelegramBot({
      token: "token",
      allowedUserId: 123,
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

  test("progress command reports current verbosity", async () => {
    const bot = createTelegramBot({
      token: "token",
      allowedUserId: 123,
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
      allowedUserId: 123,
      controller,
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })
    const reply = vi.fn(async () => undefined)

    await bot.commands.get("progress")({ message: { text: "/progress verbose" }, reply })

    expect(controller.setProgressVerbosity).toHaveBeenCalledWith("verbose")
    expect(reply).toHaveBeenCalledWith("Tool progress set to verbose.")
  })

  test("progress command rejects unknown verbosity", async () => {
    const controller = {
      setProgressVerbosity: vi.fn(),
    }
    const bot = createTelegramBot({
      token: "token",
      allowedUserId: 123,
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
        voice: "en-US-AndrewNeural",
        sttModel: "whisper-large-v3-turbo",
        hasGroqApiKey: true,
        ffmpegAvailable: false,
        cacheDirectory: "/cache/voice",
      })),
    }
    const bot = createTelegramBot({
      token: "token",
      allowedUserId: 123,
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
      allowedUserId: 123,
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

  test("voice list command supports country code and optional page", async () => {
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
        page: 2,
        totalPages: 3,
        total: 21,
      })),
    }
    const bot = createTelegramBot({
      token: "token",
      allowedUserId: 123,
      controller: {},
      voiceService,
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })
    const reply = vi.fn(async () => undefined)

    await bot.commands.get("voice")({ message: { text: "/voice list en 2" }, reply })

    expect(voiceService.listVoices).toHaveBeenCalledWith({
      locale: "en",
      page: 2,
      pageSize: 20,
    })
    expect(reply).toHaveBeenCalledWith(
      [
        "Voices page 2/3 (21 total):",
        "en-US-AndrewNeural - en-US, Male - Microsoft Andrew Online",
      ].join("\n"),
    )
  })

  test("voice list command requires a country code", async () => {
    const voiceService = {
      listVoices: vi.fn(async () => ({ voices: [], page: 1, totalPages: 1, total: 0 })),
    }
    const bot = createTelegramBot({
      token: "token",
      allowedUserId: 123,
      controller: {},
      voiceService,
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })
    const reply = vi.fn(async () => undefined)

    await bot.commands.get("voice")({ message: { text: "/voice list" }, reply })

    expect(voiceService.listVoices).not.toHaveBeenCalled()
    expect(reply).toHaveBeenCalledWith("Use /voice list <countryCode> [page].")
  })

  test("voice list command rejects unsupported filters", async () => {
    const voiceService = {
      listVoices: vi.fn(async () => ({ voices: [], page: 1, totalPages: 1, total: 0 })),
    }
    const bot = createTelegramBot({
      token: "token",
      allowedUserId: 123,
      controller: {},
      voiceService,
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })
    const reply = vi.fn(async () => undefined)

    await bot.commands.get("voice")({ message: { text: "/voice list en male 2" }, reply })

    expect(voiceService.listVoices).not.toHaveBeenCalled()
    expect(reply).toHaveBeenCalledWith("Use /voice list <countryCode> [page].")
  })

  test("voice list command rejects full locale codes", async () => {
    const voiceService = {
      listVoices: vi.fn(async () => ({ voices: [], page: 1, totalPages: 1, total: 0 })),
    }
    const bot = createTelegramBot({
      token: "token",
      allowedUserId: 123,
      controller: {},
      voiceService,
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })
    const reply = vi.fn(async () => undefined)

    await bot.commands.get("voice")({ message: { text: "/voice list en-US" }, reply })

    expect(voiceService.listVoices).not.toHaveBeenCalled()
    expect(reply).toHaveBeenCalledWith("Use /voice list <countryCode> [page].")
  })

  test("voice set validates and persists selected voice", async () => {
    const voiceService = {
      setVoice: vi.fn(async () => ({ ShortName: "uk-UA-OstapNeural" })),
    }
    const bot = createTelegramBot({
      token: "token",
      allowedUserId: 123,
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
      allowedUserId: 123,
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
      allowedUserId: 123,
      controller: {},
      logger,
      botFactory: FakeBot,
    })
    const next = vi.fn()

    await bot.middlewares[0]({ from: { id: 999 } }, next)

    expect(next).not.toHaveBeenCalled()
    expect(logger.warn).toHaveBeenCalled()
  })

  test("error handler logs and sends a safe reply", async () => {
    const logger = { warn: vi.fn(), error: vi.fn() }
    const bot = createTelegramBot({
      token: "token",
      allowedUserId: 123,
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
      allowedUserId: 123,
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
      allowedUserId: 123,
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

  test("stop command reports when there is no active session", async () => {
    const bot = createTelegramBot({
      token: "token",
      allowedUserId: 123,
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
      allowedUserId: 123,
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
      allowedUserId: 123,
      controller,
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })
    const reply = vi.fn(async () => ({ message_id: 11, chat: { id: 456 }, text: "answer" }))
    const sendChatAction = vi.fn(async () => undefined)
    const setMessageReaction = vi.fn(async () => true)

    await bot.messageHandlers.get("message:text")({
      message: { message_id: 10, text: "hello", chat: { id: 456 } },
      api: { sendChatAction, setMessageReaction },
      reply,
    })

    expect(setMessageReaction).toHaveBeenNthCalledWith(1, 456, 10, [{ type: "emoji", emoji: "👀" }])
    expect(controller.sendPrompt).toHaveBeenCalledWith(
      expect.stringContaining("hello"),
      expect.objectContaining({ onProgress: expect.any(Function) }),
    )
    expect(reply).toHaveBeenCalledWith("answer")
    expect(setMessageReaction).toHaveBeenNthCalledWith(2, 456, 10, [])
  })

  test("text prompts send voice replies when voice mode is all", async () => {
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
      allowedUserId: 123,
      controller,
      voiceService,
      sendVoice,
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

    expect(reply).toHaveBeenCalledWith("answer")
    expect(voiceService.shouldSpeak).toHaveBeenCalledWith({ source: "text" })
    expect(voiceService.synthesizeTelegramVoice).toHaveBeenCalledWith("answer")
    expect(sendVoice).toHaveBeenCalledWith({
      ctx: expect.objectContaining({ reply }),
      filePath: "/cache/reply.ogg",
    })
  })

  test("text prompts keep text replies when voice reply fails", async () => {
    const controller = {
      sendPrompt: vi.fn(async () => "answer"),
    }
    const logger = { warn: vi.fn(), error: vi.fn() }
    const voiceService = {
      shouldSpeak: vi.fn(() => true),
      synthesizeTelegramVoice: vi.fn(async () => {
        throw new Error("ffmpeg missing")
      }),
    }
    const bot = createTelegramBot({
      token: "token",
      allowedUserId: 123,
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

    expect(reply).toHaveBeenCalledWith("answer")
    expect(reply).toHaveBeenCalledWith("Voice reply failed. Text reply is still available.")
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
      allowedUserId: 123,
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
      allowedUserId: 123,
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
      allowedUserId: 123,
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
      allowedUserId: 123,
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
      allowedUserId: 123,
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
      allowedUserId: 123,
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
      allowedUserId: 123,
      controller,
      logger: { warn: vi.fn(), error: vi.fn() },
      botFactory: FakeBot,
    })

    await bot.messageHandlers.get("message:text")({
      message: { message_id: 10, text: "hello", chat: { id: 456 } },
      api: {
        sendChatAction: vi.fn(async () => undefined),
        setMessageReaction: vi.fn(async () => true),
      },
      reply: vi.fn(async () => ({ message_id: 11, chat: { id: 456 }, text: "answer" })),
    })

    expect(controller.sendPrompt).toHaveBeenCalledWith(
      [
        "hello",
        "",
        "Telegram gateway note:",
        "The gateway shows tool and skill usage separately in an Activity message. Do not include tool or skill usage announcements in your final response.",
        "If a short emoji reaction to the user's message is appropriate, include exactly one hidden marker anywhere in your response:",
        "[telegram_reaction: 👍]",
        "Use only one standard Telegram emoji, and omit the marker when no reaction is useful. The marker will be removed before the user sees the reply.",
      ].join("\n"),
      expect.objectContaining({ onProgress: expect.any(Function) }),
    )
  })

  test("hidden telegram reaction markers are stripped and applied to the user message", async () => {
    const controller = {
      sendPrompt: vi.fn(async () => "Nice idea.\n[telegram_reaction: 👍]"),
    }
    const bot = createTelegramBot({
      token: "token",
      allowedUserId: 123,
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
      allowedUserId: 123,
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
        attachments: [attachment],
      },
      expect.objectContaining({ onProgress: expect.any(Function) }),
    )
    expect(reply).toHaveBeenCalledTimes(1)
    expect(reply).toHaveBeenCalledWith("image answer")
    expect(cleanupMediaAttachments).toHaveBeenCalledWith([attachment], logger)
  })

  test("voice messages are transcribed, sent as prompts, replied as text and voice", async () => {
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
      allowedUserId: 123,
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
      message: { message_id: 10, chat: { id: 456 }, voice: { file_id: "voice-1" } },
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
      expect.stringContaining("transcribed prompt"),
      expect.objectContaining({ onProgress: expect.any(Function) }),
    )
    expect(reply).toHaveBeenCalledWith("voice answer")
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
      allowedUserId: 123,
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
      allowedUserId: 123,
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
        if (prompt.startsWith("hello")) {
          return "answer"
        }
        return "feedback response"
      }),
    }
    const bot = createTelegramBot({
      token: "token",
      allowedUserId: 123,
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
      allowedUserId: 123,
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
      allowedUserId: 123,
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
      media_group_id: "album-1",
      caption,
      photo: [{ file_id: fileId, width: 1280, height: 720, file_size: 3000 }],
    },
    api: { sendChatAction: vi.fn(async () => undefined) },
    reply,
  }
}
