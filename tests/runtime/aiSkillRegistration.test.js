import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const repoRoot = new URL("../../", import.meta.url)
const repoRootPath = fileURLToPath(repoRoot)
const canonicalSkillPath = "skills/github-project-task-workflow/SKILL.md"

const readRepoFile = (path) => readFile(new URL(path, repoRoot), "utf8")
const readRepoJson = async (path) => JSON.parse(await readRepoFile(path))

describe("repository AI skill registration", () => {
  test("ships a canonical GitHub issue task workflow skill", async () => {
    const skill = await readRepoFile(canonicalSkillPath)

    expect(skill).toMatch(/^---\nname: github-project-task-workflow\n/m)
    expect(skill).toContain("# GitHub Issue Task Workflow")
    expect(skill).toContain("GitHub CLI is optional for contributors")
    expect(skill).toContain("Issue format: `github-login/issue-number-title-slug`")
  })

  test("registers the canonical skill folder with OpenCode", async () => {
    const config = await readRepoJson("opencode.jsonc")

    expect(config.$schema).toBe("https://opencode.ai/config.json")
    expect(config.skills).toEqual({ paths: ["./skills"] })
  })

  test("exposes the skill to Claude Code plugin loading without duplicate project skills", async () => {
    const pluginManifest = await readRepoJson(".claude-plugin/plugin.json")

    expect(pluginManifest.name).toBe("opencode-remote")
    expect(pluginManifest.skills).toBe("./skills/")
    await expect(
      readRepoFile(".claude/skills/github-project-task-workflow/SKILL.md"),
    ).rejects.toMatchObject({ code: "ENOENT" })
  })

  test("registers the repository as a Codex plugin with canonical skills", async () => {
    const marketplace = await readRepoJson(".agents/plugins/marketplace.json")
    const pluginManifest = await readRepoJson(".codex-plugin/plugin.json")
    const marketplaceSource = marketplace.plugins.find(
      (plugin) => plugin.name === "opencode-remote",
    )?.source

    expect(marketplaceSource).toEqual({ source: "local", path: "./" })
    expect(resolve(repoRootPath, marketplaceSource.path)).toBe(resolve(repoRootPath))
    expect(pluginManifest.name).toBe("opencode-remote")
    expect(pluginManifest.skills).toBe("./skills/")
  })
})
