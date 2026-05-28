import { describe, expect, test } from "vitest"
import { createGroupMemory } from "../../src/adapters/telegram/groupMemory.js"

const scope = { chatId: -1001, threadId: 7, sessionId: "ses_1" }

function entry(index, overrides = {}) {
  return {
    messageId: index,
    author: `User ${index}`,
    text: `message ${index}`,
    kind: "text",
    timestamp: 1_000 + index,
    ...overrides,
  }
}

describe("createGroupMemory", () => {
  test("builds context from new messages since the cursor with overlap", () => {
    const memory = createGroupMemory({
      storeMessages: 20,
      storeChars: 500,
      contextMessages: 6,
      contextChars: 500,
      overlap: 2,
    })
    const records = []
    for (let index = 1; index <= 8; index += 1) {
      records.push(memory.record(scope, entry(index)))
    }
    memory.markPromptCursor(scope, records[4].id)

    const context = memory.buildContext(scope, { currentMessageId: 8 })

    expect(context.entries.map((item) => item.messageId)).toEqual([4, 5, 6, 7])
    expect(context.text).toContain("User 4: message 4")
    expect(context.text).not.toContain("message 8")
  })

  test("prunes stored messages by count and total chars", () => {
    const memory = createGroupMemory({
      storeMessages: 3,
      storeChars: 28,
      contextMessages: 10,
      contextChars: 500,
      overlap: 0,
    })

    memory.record(scope, entry(1, { text: "alpha" }))
    memory.record(scope, entry(2, { text: "bravo" }))
    memory.record(scope, entry(3, { text: "charlie" }))
    memory.record(scope, entry(4, { text: "delta" }))

    expect(memory.snapshot(scope).map((item) => item.messageId)).toEqual([2, 3, 4])
  })

  test("applies context char caps and per-message truncation", () => {
    const memory = createGroupMemory({
      storeMessages: 10,
      storeChars: 1_000,
      contextMessages: 10,
      contextChars: 80,
      maxEntryChars: 20,
      overlap: 0,
    })

    memory.record(scope, entry(1, { text: "short" }))
    memory.record(scope, entry(2, { text: "x".repeat(100) }))
    memory.record(scope, entry(3, { text: "last" }))

    const context = memory.buildContext(scope)

    expect(context.text.length).toBeLessThanOrEqual(80)
    expect(context.text).toContain("xxxxxxxxxxxxxxxxxxxx...")
  })

  test("allows per-call context limits", () => {
    const memory = createGroupMemory({ contextMessages: 10, contextChars: 500, overlap: 0 })
    for (let index = 1; index <= 5; index += 1) {
      memory.record(scope, entry(index))
    }

    const context = memory.buildContext(scope, { contextMessages: 2 })

    expect(context.entries.map((item) => item.messageId)).toEqual([4, 5])
  })

  test("keeps topics and sessions isolated", () => {
    const memory = createGroupMemory({ storeMessages: 20 })
    memory.record(scope, entry(1, { text: "topic seven" }))
    memory.record({ ...scope, threadId: 8 }, entry(2, { text: "topic eight" }))
    memory.record({ ...scope, sessionId: "ses_2" }, entry(3, { text: "session two" }))

    expect(memory.snapshot(scope).map((item) => item.text)).toEqual(["topic seven"])
  })

  test("clears one scope or all memory", () => {
    const memory = createGroupMemory({ storeMessages: 20 })
    memory.record(scope, entry(1))
    memory.record({ ...scope, threadId: 8 }, entry(2))

    memory.clearScope(scope)
    expect(memory.snapshot(scope)).toEqual([])
    expect(memory.snapshot({ ...scope, threadId: 8 })).toHaveLength(1)

    memory.clearAll()
    expect(memory.snapshot({ ...scope, threadId: 8 })).toEqual([])
  })

  test("clears every scope for one chat", () => {
    const memory = createGroupMemory({ storeMessages: 20 })
    memory.record(scope, entry(1))
    memory.record({ ...scope, threadId: 8 }, entry(2))
    memory.record({ ...scope, chatId: -2002 }, entry(3))

    memory.clearChat(-1001)

    expect(memory.snapshot(scope)).toEqual([])
    expect(memory.snapshot({ ...scope, threadId: 8 })).toEqual([])
    expect(memory.snapshot({ ...scope, chatId: -2002 })).toHaveLength(1)
  })
})
