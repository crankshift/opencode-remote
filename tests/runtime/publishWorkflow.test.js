import { readFile } from "node:fs/promises"
import { describe, expect, test } from "vitest"

describe("publish workflow", () => {
  test("runs only when commits are pushed to main", async () => {
    const workflow = await readFile(
      new URL("../../.github/workflows/publish.yml", import.meta.url),
      "utf8",
    )

    expect(workflow).toMatch(/^on:\n {2}push:\n {4}branches:\n {6}- main$/mu)
    expect(workflow).not.toContain("workflow_dispatch")
    expect(workflow).not.toContain("tags:")
  })
})
