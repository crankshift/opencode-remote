import { access, copyFile, mkdir, rm, stat } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..")
const DEFAULT_BUNDLED_SKILLS_DIRECTORY = join(PACKAGE_ROOT, "bundled-skills")

export const BUNDLED_MEME_SKILL_NAME = "meme-generation"
const LEGACY_BUNDLED_MEME_AGENT_NAME = "opencode-remote-meme"

export function bundledMemeRuntimeAssetPaths({
  projectRoot = process.cwd(),
  bundledSkillsDirectory = DEFAULT_BUNDLED_SKILLS_DIRECTORY,
} = {}) {
  return {
    skill: {
      sourcePath: join(bundledSkillsDirectory, BUNDLED_MEME_SKILL_NAME, "SKILL.md"),
      projectPath: join(
        projectRoot,
        ".opencode",
        "skills",
        "opencode-remote-bundled",
        BUNDLED_MEME_SKILL_NAME,
        "SKILL.md",
      ),
    },
    legacyAgent: {
      projectPath: join(projectRoot, ".opencode", "agent", `${LEGACY_BUNDLED_MEME_AGENT_NAME}.md`),
    },
  }
}

export async function bundledMemeRuntimeStatus(options = {}) {
  const paths = bundledMemeRuntimeAssetPaths(options)
  const skillEnabled = await fileExists(paths.skill.projectPath)
  const legacyAgentEnabled = await fileExists(paths.legacyAgent.projectPath)

  return {
    enabled: skillEnabled,
    skill: { ...paths.skill, enabled: skillEnabled },
    legacyAgent: { ...paths.legacyAgent, enabled: legacyAgentEnabled },
  }
}

export async function installBundledMemeRuntimeForProject(options = {}) {
  const paths = bundledMemeRuntimeAssetPaths(options)
  await assertReadableFile(paths.skill.sourcePath)

  const writtenPaths = []
  await mkdir(dirname(paths.skill.projectPath), { recursive: true })
  await copyFile(paths.skill.sourcePath, paths.skill.projectPath)
  writtenPaths.push(paths.skill.projectPath)

  const removedPaths = []
  if (await fileExists(paths.legacyAgent.projectPath)) {
    await rm(paths.legacyAgent.projectPath, { force: true })
    removedPaths.push(paths.legacyAgent.projectPath)
  }

  return {
    ...(await bundledMemeRuntimeStatus(options)),
    writtenPaths,
    removedPaths,
  }
}

async function fileExists(filePath) {
  try {
    const info = await stat(filePath)
    return info.isFile()
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") {
      return false
    }
    throw error
  }
}

async function assertReadableFile(filePath) {
  try {
    const info = await stat(filePath)
    if (!info.isFile()) {
      throw new Error("not a file")
    }
    await access(filePath)
  } catch (error) {
    throw new Error(`Bundled meme runtime asset is missing: ${filePath}`, { cause: error })
  }
}
