import { describe, expect, test } from "vitest"
import { chunkText } from "../../src/core/formatting/chunkText.js"

describe("chunkText", () => {
  test("returns one chunk when text is below the limit", () => {
    expect(chunkText("hello", 10)).toEqual(["hello"])
  })

  test("splits text without exceeding the limit", () => {
    const chunks = chunkText("alpha beta gamma", 8)

    expect(chunks).toEqual(["alpha", "beta", "gamma"])
    expect(chunks.every((chunk) => chunk.length <= 8)).toBe(true)
  })

  test("splits long words at the limit", () => {
    expect(chunkText("abcdefghij", 4)).toEqual(["abcd", "efgh", "ij"])
  })
})
