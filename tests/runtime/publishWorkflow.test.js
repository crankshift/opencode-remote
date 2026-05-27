import { readFile } from "node:fs/promises"
import { describe, expect, test } from "vitest"

describe("publish workflow", () => {
  test("runs when v-prefixed release tags are pushed or dispatched", async () => {
    const workflow = await readFile(
      new URL("../../.github/workflows/publish.yml", import.meta.url),
      "utf8",
    )

    expect(workflow).toMatch(/^on:\n {2}push:\n {4}tags:\n {6}- "v\*"$/mu)
    expect(workflow).toContain("workflow_dispatch:")
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
    expect(workflow).toContain("GITHUB_REF_TYPE")
    expect(workflow).not.toMatch(/NPM_TOKEN|NODE_AUTH_TOKEN/)
  })
})

describe("release tag workflow", () => {
  test("creates version tags only after successful main checks", async () => {
    const workflow = await readFile(
      new URL("../../.github/workflows/release-tag.yml", import.meta.url),
      "utf8",
    )

    expect(workflow).toMatch(
      /^on:\n {2}workflow_run:\n {4}workflows:\n {6}- "Check"\n {4}types:\n {6}- completed$/mu,
    )
    expect(workflow).toContain("actions: write")
    expect(workflow).toContain("contents: write")
    expect(workflow).toContain("github.event.workflow_run.conclusion == 'success'")
    expect(workflow).toContain("github.event.workflow_run.event == 'push'")
    expect(workflow).toContain("github.event.workflow_run.head_branch == 'main'")
    expect(workflow).toContain("github.event.workflow_run.head_sha")
    expect(workflow).toContain("refs/tags/v$VERSION")
    expect(workflow).toContain("git/refs")
    expect(workflow).toContain('gh workflow run publish.yml --ref "$TAG"')
    expect(workflow).not.toMatch(/npm publish|NPM_TOKEN|NODE_AUTH_TOKEN/)
  })
})
