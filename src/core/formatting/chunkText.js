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
  let offset = 0

  while (offset < text.length) {
    const remainingLength = text.length - offset
    if (remainingLength <= maxLength) {
      chunks.push(text.slice(offset))
      break
    }

    const slice = text.slice(offset, offset + maxLength + 1)
    const splitAt = Math.max(slice.lastIndexOf("\n"), slice.lastIndexOf(" "))
    if (splitAt >= 0 && splitAt < maxLength) {
      const end = offset + splitAt + 1
      chunks.push(text.slice(offset, end))
      offset = end
    } else {
      const end = offset + maxLength
      chunks.push(text.slice(offset, end))
      offset = end
    }
  }

  return chunks
}
