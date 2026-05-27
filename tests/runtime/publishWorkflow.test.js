import { readFile } from "node:fs/promises"
import { describe, expect, test } from "vitest"

describe("publish workflow", () => {
  test("runs only when v-prefixed release tags are pushed", async () => {
    const workflow = await readFile(
      new URL("../../.github/workflows/publish.yml", import.meta.url),
      "utf8",
    )

    expect(workflow).toMatch(/^on:\n {2}push:\n {4}tags:\n {6}- "v\*"$/mu)
    expect(workflow).not.toContain("workflow_dispatch")
    expect(workflow).not.toMatch(/^ {4}branches:/mu)
  })

  test("publishes only after release checks pass", async () => {
    const workflow = await readFile(
      new URL("../../.github/workflows/publish.yml", import.meta.url),
      "utf8",
    )

    expect(workflow).toMatch(/^ {2}check:$/mu)
    expect(workflow).toMatch(/^ {2}publish:\n {4}runs-on: ubuntu-latest\n {4}needs: check$/mu)
    expect(workflow).toContain("npm publish --provenance --access public")
    expect(workflow).not.toMatch(/NPM_TOKEN|NODE_AUTH_TOKEN/)
  })
})
