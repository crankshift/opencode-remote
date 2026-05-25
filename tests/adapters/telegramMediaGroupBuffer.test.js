import { afterEach, describe, expect, test, vi } from "vitest"
import { createMediaGroupBuffer } from "../../src/adapters/telegram/mediaGroupBuffer.js"

describe("createMediaGroupBuffer", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  test("flushes one sorted album after the debounce window", async () => {
    vi.useFakeTimers()
    const onFlush = vi.fn(async () => undefined)
    const buffer = createMediaGroupBuffer({ waitMs: 1500, onFlush, logger: { warn: vi.fn() } })

    buffer.add({ message_id: 12, chat: { id: 456 }, media_group_id: "album-1" })
    await vi.advanceTimersByTimeAsync(1000)
    buffer.add({ message_id: 10, chat: { id: 456 }, media_group_id: "album-1" })
    buffer.add({ message_id: 11, chat: { id: 456 }, media_group_id: "album-1" })

    await vi.advanceTimersByTimeAsync(1499)
    expect(onFlush).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)

    expect(onFlush).toHaveBeenCalledTimes(1)
    expect(onFlush).toHaveBeenCalledWith([
      { message_id: 10, chat: { id: 456 }, media_group_id: "album-1" },
      { message_id: 11, chat: { id: 456 }, media_group_id: "album-1" },
      { message_id: 12, chat: { id: 456 }, media_group_id: "album-1" },
    ])
  })

  test("keeps equal media group IDs separate by chat", async () => {
    vi.useFakeTimers()
    const onFlush = vi.fn(async () => undefined)
    const buffer = createMediaGroupBuffer({ waitMs: 10, onFlush, logger: { warn: vi.fn() } })

    buffer.add({ message_id: 1, chat: { id: 111 }, media_group_id: "album-1" })
    buffer.add({ message_id: 2, chat: { id: 222 }, media_group_id: "album-1" })

    await vi.advanceTimersByTimeAsync(10)

    expect(onFlush).toHaveBeenCalledTimes(2)
    expect(onFlush).toHaveBeenNthCalledWith(1, [
      { message_id: 1, chat: { id: 111 }, media_group_id: "album-1" },
    ])
    expect(onFlush).toHaveBeenNthCalledWith(2, [
      { message_id: 2, chat: { id: 222 }, media_group_id: "album-1" },
    ])
  })
})
