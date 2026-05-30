import { mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { discoverOpenCodeSkills } from "../../src/core/opencode/skillDiscovery.js"

async function writeSkill(root, name, description = `Use when testing ${name}.`) {
  const directory = join(root, name)
  await mkdir(directory, { recursive: true })
  await writeFile(
    join(directory, "SKILL.md"),
    ["---", `name: ${name}`, `description: ${description}`, "---", "", `# ${name}`, ""].join("\n"),
  )
}

describe("OpenCode skill discovery", () => {
  test("discovers project config skill paths and gateway generated skills", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "opencode-remote-skills-"))
    await mkdir(join(projectRoot, "skills"), { recursive: true })
    await mkdir(join(projectRoot, ".opencode", "skills", "opencode-remote-generated"), {
      recursive: true,
    })
    await writeFile(
      join(projectRoot, "opencode.jsonc"),
      '{\n  // project skills\n  "skills": { "paths": ["./skills"] }\n}\n',
    )
    await writeSkill(join(projectRoot, "skills"), "project-helper")
    await writeSkill(
      join(projectRoot, ".opencode", "skills", "opencode-remote-generated"),
      "image-style-coach",
      "Use when improving generated image prompts.",
    )

    const result = await discoverOpenCodeSkills({ projectRoot, homeDirectory: projectRoot })

    expect(result.skills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "project-helper",
          description: "Use when testing project-helper.",
          scope: "project",
          source: "config-path",
          generated: false,
        }),
        expect.objectContaining({
          name: "image-style-coach",
          description: "Use when improving generated image prompts.",
          scope: "project",
          source: "opencode-remote-generated",
          generated: true,
        }),
      ]),
    )
  })

  test("discovers global config skill paths and compatible external skills", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "opencode-remote-project-"))
    const homeDirectory = await mkdtemp(join(tmpdir(), "opencode-remote-home-"))
    await mkdir(join(homeDirectory, ".config", "opencode", "skills"), { recursive: true })
    await mkdir(join(homeDirectory, ".claude", "skills"), { recursive: true })
    await mkdir(join(projectRoot, ".agents", "skills"), { recursive: true })
    await writeFile(
      join(homeDirectory, ".config", "opencode", "opencode.json"),
      JSON.stringify({ skills: { paths: ["./skills"] } }),
    )
    await writeSkill(join(homeDirectory, ".config", "opencode", "skills"), "global-helper")
    await writeSkill(join(homeDirectory, ".claude", "skills"), "claude-helper")
    await writeSkill(join(projectRoot, ".agents", "skills"), "agent-helper")

    const result = await discoverOpenCodeSkills({ projectRoot, homeDirectory })

    expect(result.skills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "global-helper", scope: "global", source: "config-path" }),
        expect.objectContaining({
          name: "claude-helper",
          scope: "global",
          source: "claude-compatible",
        }),
        expect.objectContaining({
          name: "agent-helper",
          scope: "project",
          source: "agents-compatible",
        }),
      ]),
    )
  })

  test("reports configured remote skill URLs without listing them", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "opencode-remote-skill-urls-"))
    await writeFile(
      join(projectRoot, "opencode.json"),
      JSON.stringify({ skills: { urls: ["https://example.com/.well-known/skills/"] } }),
    )

    const result = await discoverOpenCodeSkills({ projectRoot, homeDirectory: projectRoot })

    expect(result.remoteSkillUrls).toEqual(["https://example.com/.well-known/skills/"])
  })
})
