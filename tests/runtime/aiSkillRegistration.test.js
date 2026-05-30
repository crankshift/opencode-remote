import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const repoRoot = new URL("../../", import.meta.url)
const repoRootPath = fileURLToPath(repoRoot)
const canonicalSkillPath = "skills/github-project-task-workflow/SKILL.md"
const canonicalSkillPaths = [
  canonicalSkillPath,
  "skills/opencode-remote-troubleshooting/SKILL.md",
  "skills/telegram-sticker-behavior/SKILL.md",
  "skills/opencode-remote-gateway-capabilities/SKILL.md",
  "skills/opencode-remote-skill-creator/SKILL.md",
]

const readRepoFile = (path) => readFile(new URL(path, repoRoot), "utf8")
const readRepoJson = async (path) => JSON.parse(await readRepoFile(path))

describe("repository AI skill registration", () => {
  test("ships a canonical GitHub issue task workflow skill", async () => {
    const skill = await readRepoFile(canonicalSkillPath)

    expect(skill).toMatch(/^---\nname: github-project-task-workflow\n/m)
    expect(skill).toContain("# GitHub Issue Task Workflow")
    expect(skill).toContain("GitHub CLI is optional for contributors")
    expect(skill).toContain("Issue format: `github-login/issue-number-title-slug`")
    expect(skill).toContain("bump `package.json` version and update `CHANGELOG.md`")
  })

  test("ships bundled gateway support skills with trigger descriptions", async () => {
    const troubleshooting = await readRepoFile("skills/opencode-remote-troubleshooting/SKILL.md")
    const stickers = await readRepoFile("skills/telegram-sticker-behavior/SKILL.md")
    const capabilities = await readRepoFile("skills/opencode-remote-gateway-capabilities/SKILL.md")
    const creator = await readRepoFile("skills/opencode-remote-skill-creator/SKILL.md")

    expect(troubleshooting).toMatch(/^---\nname: opencode-remote-troubleshooting\n/m)
    expect(troubleshooting).toContain(
      "Use when diagnosing opencode-remote, Telegram bot, group routing, OpenCode startup, voice, sticker, ffmpeg, or safe debug log issues.",
    )
    expect(troubleshooting).toContain("Do not ask for Telegram bot tokens")

    expect(stickers).toMatch(/^---\nname: telegram-sticker-behavior\n/m)
    expect(stickers).toContain(
      "Use when working on Telegram sticker understanding, saved sticker packs, sticker catalogs, animated sticker previews, or hidden telegram_sticker markers.",
    )
    expect(stickers).toContain("[telegram_sticker: any]")

    expect(capabilities).toMatch(/^---\nname: opencode-remote-gateway-capabilities\n/m)
    expect(capabilities).toContain(
      "Use when designing or changing opencode-remote gateway capabilities, Telegram behavior, voice replies, Activity messages, permission UI, reactions, stickers, or gateway-authored prompts.",
    )
    expect(capabilities).toContain("Do not move Telegram-specific behavior into core services")

    expect(creator).toMatch(/^---\nname: opencode-remote-skill-creator\n/m)
    expect(creator).toContain(
      "Use when a user asks OpenCode Remote to create, generate, draft, or improve a user/project OpenCode skill.",
    )
    expect(creator).toContain(".opencode/skills/opencode-remote-generated/<skill-name>/SKILL.md")
  })

  test("all canonical skills have required OpenCode skill frontmatter", async () => {
    for (const skillPath of canonicalSkillPaths) {
      const skill = await readRepoFile(skillPath)
      const folderName = skillPath.split("/").at(-2)

      expect(skill).toMatch(/^---\n/m)
      expect(skill).toContain(`name: ${folderName}`)
      expect(skill).toMatch(/\ndescription: .+\n/)
      expect(skill).toContain("# ")
    }
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
