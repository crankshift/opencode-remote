import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const repoRoot = new URL("../../", import.meta.url)
const repoRootPath = fileURLToPath(repoRoot)
const developmentSkillPath = "skills/development/github-project-task-workflow/SKILL.md"
const developmentSkillPaths = [
  developmentSkillPath,
  "skills/development/opencode-remote-troubleshooting/SKILL.md",
  "skills/development/telegram-sticker-behavior/SKILL.md",
  "skills/development/opencode-remote-gateway-capabilities/SKILL.md",
  "skills/development/opencode-remote-skill-creator/SKILL.md",
]
const bundledMediaSkillPaths = [
  "bundled-skills/p5js/SKILL.md",
  "bundled-skills/claude-design/SKILL.md",
  "bundled-skills/design-md/SKILL.md",
  "bundled-skills/popular-web-designs/SKILL.md",
  "bundled-skills/architecture-diagram/SKILL.md",
  "bundled-skills/comfyui/SKILL.md",
  "bundled-skills/gif-search/SKILL.md",
  "bundled-skills/concept-diagrams/SKILL.md",
  "bundled-skills/hyperframes/SKILL.md",
  "bundled-skills/meme-generation/SKILL.md",
]
const bundledGuidanceSkillPaths = [
  "bundled-skills/opencode-remote-troubleshooting/SKILL.md",
  "bundled-skills/telegram-sticker-behavior/SKILL.md",
  "bundled-skills/opencode-remote-gateway-capabilities/SKILL.md",
  "bundled-skills/opencode-remote-skill-creator/SKILL.md",
]
const canonicalAgentPath = ".opencode/agent/opencode-remote-diagnostician.md"

const readRepoFile = (path) => readFile(new URL(path, repoRoot), "utf8")
const readRepoJson = async (path) => JSON.parse(await readRepoFile(path))

describe("repository AI skill registration", () => {
  test("ships a canonical GitHub issue task workflow skill", async () => {
    const skill = await readRepoFile(developmentSkillPath)

    expect(skill).toMatch(/^---\nname: github-project-task-workflow\n/m)
    expect(skill).toContain("# GitHub Issue Task Workflow")
    expect(skill).toContain("GitHub CLI is optional for contributors")
    expect(skill).toContain("Issue format: `github-login/issue-number-title-slug`")
    expect(skill).toContain("bump `package.json` version and update `CHANGELOG.md`")
  })

  test("ships development gateway support skills with trigger descriptions", async () => {
    const troubleshooting = await readRepoFile(
      "skills/development/opencode-remote-troubleshooting/SKILL.md",
    )
    const stickers = await readRepoFile("skills/development/telegram-sticker-behavior/SKILL.md")
    const capabilities = await readRepoFile(
      "skills/development/opencode-remote-gateway-capabilities/SKILL.md",
    )
    const creator = await readRepoFile("skills/development/opencode-remote-skill-creator/SKILL.md")

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

  test("all development skills have required OpenCode skill frontmatter", async () => {
    for (const skillPath of developmentSkillPaths) {
      const skill = await readRepoFile(skillPath)
      const folderName = skillPath.split("/").at(-2)

      expect(skill).toMatch(/^---\n/m)
      expect(skill).toContain(`name: ${folderName}`)
      expect(skill).toMatch(/\ndescription: .+\n/)
      expect(skill).toContain("# ")
    }
  })

  test("registers only development skills with the repo OpenCode config", async () => {
    const config = await readRepoJson("opencode.jsonc")

    expect(config.$schema).toBe("https://opencode.ai/config.json")
    expect(config.skills).toEqual({ paths: ["./skills/development"] })
  })

  test("ships bundled media producer skills outside the development skill path", async () => {
    for (const skillPath of bundledMediaSkillPaths) {
      const skill = await readRepoFile(skillPath)
      const folderName = skillPath.split("/").at(-2)

      expect(skill).toMatch(/^---\n/m)
      expect(skill).toContain(`name: ${folderName}`)
      expect(skill).toMatch(/\ndescription: .+\n/)
      expect(skill).not.toMatch(/\nauthor:/u)
      expect(skill).toContain("MEDIA:/absolute/path/to/file")
      expect(skill).toContain("cache/generated-media")
      expect(skill).toContain("OpenCode Remote")
    }
  })

  test("ships bundled OpenCode Remote guidance skills outside the development skill path", async () => {
    for (const skillPath of bundledGuidanceSkillPaths) {
      const skill = await readRepoFile(skillPath)
      const folderName = skillPath.split("/").at(-2)

      expect(skill).toMatch(/^---\n/m)
      expect(skill).toContain(`name: ${folderName}`)
      expect(skill).toMatch(/\ndescription: .+\n/)
      expect(skill).not.toMatch(/maintainer board|GitHub Project|project ticket/u)
      expect(skill).not.toMatch(/raw Telegram IDs|raw local paths|bot tokens/u)
      expect(skill).toContain("OpenCode Remote")
    }
  })

  test("ships a read-only OpenCode Remote diagnostician agent", async () => {
    const agent = await readRepoFile(canonicalAgentPath)

    expect(agent).toMatch(/^---\n/m)
    expect(agent).toContain(
      "description: Read-only subagent for diagnosing OpenCode Remote Telegram, OpenCode startup, voice, sticker, group routing, and safe debug log issues.",
    )
    expect(agent).toContain("mode: subagent")
    expect(agent).toContain("edit: deny")
    expect(agent).toContain("Never modify files, commit, push, or change runtime state")
    expect(agent).toContain("Do not ask for Telegram bot tokens")
  })

  test("exposes the skill to Claude Code plugin loading without duplicate project skills", async () => {
    const pluginManifest = await readRepoJson(".claude-plugin/plugin.json")

    expect(pluginManifest.name).toBe("opencode-remote")
    expect(pluginManifest.skills).toBe("./skills/development/")
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
    expect(pluginManifest.skills).toBe("./skills/development/")
  })
})
