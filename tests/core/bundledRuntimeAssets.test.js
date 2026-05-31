import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, test } from "vitest"
import {
  BUNDLED_MEME_SKILL_NAME,
  bundledMemeRuntimeAssetPaths,
  bundledMemeRuntimeStatus,
  installBundledRuntimeSkillsForProject,
} from "../../src/core/opencode/bundledRuntimeAssets.js"

const tempDirs = []

async function tempDir(name = "runtime-assets") {
  const dir = await mkdtemp(join(tmpdir(), `opencode-remote-${name}-`))
  tempDirs.push(dir)
  return dir
}

async function createSourceAssets(skillNames = [BUNDLED_MEME_SKILL_NAME]) {
  const root = await tempDir("runtime-source")
  const bundledSkillsDirectory = join(root, "bundled-skills")
  for (const skillName of skillNames) {
    await mkdir(join(bundledSkillsDirectory, skillName), { recursive: true })
    await writeFile(join(bundledSkillsDirectory, skillName, "SKILL.md"), `# ${skillName}\n`)
  }
  return { bundledSkillsDirectory }
}

afterEach(async () => {
  for (const dir of tempDirs.splice(0)) {
    await rm(dir, { recursive: true, force: true })
  }
})

describe("bundled meme runtime assets", () => {
  test("reports disabled when the project-local skill is missing", async () => {
    const projectRoot = await tempDir("runtime-project")
    const sources = await createSourceAssets()

    const status = await bundledMemeRuntimeStatus({ projectRoot, ...sources })

    expect(status.enabled).toBe(false)
    expect(status.skill.enabled).toBe(false)
    expect(status.legacyAgent.enabled).toBe(false)
    expect(status.skill.projectPath).toBe(
      join(
        projectRoot,
        ".opencode",
        "skills",
        "opencode-remote-bundled",
        "meme-generation",
        "SKILL.md",
      ),
    )
    expect(status.legacyAgent.projectPath).toBe(
      join(projectRoot, ".opencode", "agent", "opencode-remote-meme.md"),
    )
  })

  test("install copies the skill and removes the legacy project-local meme agent", async () => {
    const projectRoot = await tempDir("runtime-project")
    const sources = await createSourceAssets()
    const legacyAgentPath = join(projectRoot, ".opencode", "agent", "opencode-remote-meme.md")
    await mkdir(join(legacyAgentPath, ".."), { recursive: true })
    await writeFile(legacyAgentPath, "# stale opencode-remote-meme\n")

    const result = await installBundledRuntimeSkillsForProject({ projectRoot, ...sources })

    expect(result.enabled).toBe(true)
    expect(result.writtenPaths).toEqual([
      join(
        projectRoot,
        ".opencode",
        "skills",
        "opencode-remote-bundled",
        BUNDLED_MEME_SKILL_NAME,
        "SKILL.md",
      ),
    ])
    expect(result.removedPaths).toEqual([legacyAgentPath])
    await expect(stat(result.skill.projectPath)).resolves.toMatchObject({
      size: expect.any(Number),
    })
    await expect(stat(result.legacyAgent.projectPath)).rejects.toMatchObject({ code: "ENOENT" })
    expect(await readFile(result.skill.projectPath, "utf8")).toBe(`# ${BUNDLED_MEME_SKILL_NAME}\n`)
  })

  test("install copies every bundled skill into the project-local bundled namespace", async () => {
    const projectRoot = await tempDir("runtime-project")
    const sources = await createSourceAssets([
      BUNDLED_MEME_SKILL_NAME,
      "opencode-remote-troubleshooting",
    ])

    const result = await installBundledRuntimeSkillsForProject({ projectRoot, ...sources })

    expect(result.writtenPaths).toEqual([
      join(
        projectRoot,
        ".opencode",
        "skills",
        "opencode-remote-bundled",
        BUNDLED_MEME_SKILL_NAME,
        "SKILL.md",
      ),
      join(
        projectRoot,
        ".opencode",
        "skills",
        "opencode-remote-bundled",
        "opencode-remote-troubleshooting",
        "SKILL.md",
      ),
    ])
    await expect(
      readFile(
        join(
          projectRoot,
          ".opencode",
          "skills",
          "opencode-remote-bundled",
          "opencode-remote-troubleshooting",
          "SKILL.md",
        ),
        "utf8",
      ),
    ).resolves.toBe("# opencode-remote-troubleshooting\n")
  })

  test("install does not write global opencode config paths", async () => {
    const projectRoot = await tempDir("runtime-project")
    const homeDirectory = await tempDir("runtime-home")
    const sources = await createSourceAssets()

    await installBundledRuntimeSkillsForProject({ projectRoot, homeDirectory, ...sources })

    await expect(stat(join(homeDirectory, ".config", "opencode"))).rejects.toMatchObject({
      code: "ENOENT",
    })
  })

  test("missing skill source asset throws a useful error", async () => {
    const projectRoot = await tempDir("runtime-project")
    const root = await tempDir("runtime-source")
    const bundledSkillsDirectory = join(root, "bundled-skills")

    await expect(
      installBundledRuntimeSkillsForProject({
        projectRoot,
        bundledSkillsDirectory,
      }),
    ).rejects.toThrow(/Bundled meme runtime asset is missing: .*meme-generation.*SKILL\.md/u)
  })

  test("returns canonical source and project paths", async () => {
    const projectRoot = await tempDir("runtime-project")
    const sources = await createSourceAssets()

    expect(bundledMemeRuntimeAssetPaths({ projectRoot, ...sources })).toEqual({
      skill: {
        sourcePath: join(sources.bundledSkillsDirectory, BUNDLED_MEME_SKILL_NAME, "SKILL.md"),
        projectPath: join(
          projectRoot,
          ".opencode",
          "skills",
          "opencode-remote-bundled",
          "meme-generation",
          "SKILL.md",
        ),
      },
      legacyAgent: {
        projectPath: join(projectRoot, ".opencode", "agent", "opencode-remote-meme.md"),
      },
    })
  })

  test("constructs default package asset paths without requiring source files", async () => {
    const projectRoot = await tempDir("runtime-project")

    const paths = bundledMemeRuntimeAssetPaths({ projectRoot })

    expect(paths.skill.sourcePath.endsWith("bundled-skills/meme-generation/SKILL.md")).toBe(true)
    expect(paths.skill.projectPath).toBe(
      join(
        projectRoot,
        ".opencode",
        "skills",
        "opencode-remote-bundled",
        "meme-generation",
        "SKILL.md",
      ),
    )
    expect(paths.legacyAgent.projectPath).toBe(
      join(projectRoot, ".opencode", "agent", "opencode-remote-meme.md"),
    )
  })
})
