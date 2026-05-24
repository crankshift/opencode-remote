export function chunkText(text, maxLength = 3900) {
  if (typeof text !== "string") {
    throw new TypeError("text must be a string")
  }
  if (!Number.isInteger(maxLength) || maxLength < 1) {
    throw new TypeError("maxLength must be a positive integer")
  }
  if (text.length <= maxLength) {
    return text.length === 0 ? [] : [text]
  }

  const chunks = []
  let remaining = text.trim()

  while (remaining.length > maxLength) {
    const slice = remaining.slice(0, maxLength + 1)
    const splitAt = Math.max(slice.lastIndexOf("\n"), slice.lastIndexOf(" "))

    if (splitAt > 0) {
      chunks.push(remaining.slice(0, splitAt).trim())
      remaining = remaining.slice(splitAt).trim()
    } else {
      chunks.push(remaining.slice(0, maxLength))
      remaining = remaining.slice(maxLength).trim()
    }
  }

  if (remaining.length > 0) {
    chunks.push(remaining)
  }

  return chunks
}
