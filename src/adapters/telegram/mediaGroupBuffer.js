export function createMediaGroupBuffer({ waitMs = 1500, onFlush, logger }) {
  const groups = new Map()

  function add(message) {
    const key = mediaGroupKey(message)
    if (!key) {
      throw new Error("Telegram media group message is missing chat or media_group_id")
    }

    const group = groups.get(key) ?? { messages: [], timer: null }
    group.messages.push(message)
    if (group.timer) {
      clearTimeout(group.timer)
    }
    group.timer = setTimeout(() => {
      void flush(key)
    }, waitMs)
    groups.set(key, group)
  }

  async function flush(key) {
    const group = groups.get(key)
    if (!group) {
      return
    }

    groups.delete(key)
    const messages = [...group.messages].sort((left, right) => left.message_id - right.message_id)
    try {
      await onFlush(messages)
    } catch (error) {
      logger?.warn?.({ error }, "Could not process Telegram media group")
    }
  }

  return { add }
}

function mediaGroupKey(message) {
  const chatId = message?.chat?.id
  const mediaGroupId = message?.media_group_id
  if (!chatId || !mediaGroupId) {
    return null
  }
  return `${chatId}:${mediaGroupId}`
}
