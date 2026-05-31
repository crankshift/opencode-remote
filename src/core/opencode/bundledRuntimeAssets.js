import { access, copyFile, mkdir, readdir, rm, stat } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..")
const DEFAULT_BUNDLED_SKILLS_DIRECTORY = join(PACKAGE_ROOT, "bundled-skills")

export const BUNDLED_MEME_SKILL_NAME = "meme-generation"
const BUNDLED_RUNTIME_SKILLS_PARENT = "opencode-remote-bundled"
const LEGACY_BUNDLED_MEME_AGENT_NAME = "opencode-remote-meme"

export function bundledMemeRuntimeAssetPaths({
  projectRoot = process.cwd(),
  bundledSkillsDirectory = DEFAULT_BUNDLED_SKILLS_DIRECTORY,
} = {}) {
  const skill = bundledSkillRuntimeAssetPaths({
    projectRoot,
    bundledSkillsDirectory,
    skillName: BUNDLED_MEME_SKILL_NAME,
  })
  return {
    skill,
    legacyAgent: {
      projectPath: join(projectRoot, ".opencode", "agent", `${LEGACY_BUNDLED_MEME_AGENT_NAME}.md`),
    },
  }
}

function bundledSkillRuntimeAssetPaths({
  projectRoot = process.cwd(),
  bundledSkillsDirectory = DEFAULT_BUNDLED_SKILLS_DIRECTORY,
  skillName,
} = {}) {
  return {
    sourcePath: join(bundledSkillsDirectory, skillName, "SKILL.md"),
    projectPath: join(
      projectRoot,
      ".opencode",
      "skills",
      BUNDLED_RUNTIME_SKILLS_PARENT,
      skillName,
      "SKILL.md",
    ),
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

export async function installBundledRuntimeSkillsForProject(options = {}) {
  const paths = bundledMemeRuntimeAssetPaths(options)
  await assertReadableFile(paths.skill.sourcePath)

  const writtenPaths = []
  const skillNames = await listBundledSkillNames(
    options.bundledSkillsDirectory ?? DEFAULT_BUNDLED_SKILLS_DIRECTORY,
  )
  for (const skillName of skillNames) {
    const skillPaths = bundledSkillRuntimeAssetPaths({ ...options, skillName })
    await assertReadableFile(skillPaths.sourcePath)
    await mkdir(dirname(skillPaths.projectPath), { recursive: true })
    await copyFile(skillPaths.sourcePath, skillPaths.projectPath)
    writtenPaths.push(skillPaths.projectPath)
  }

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

async function listBundledSkillNames(bundledSkillsDirectory) {
  const entries = await readdir(bundledSkillsDirectory, { withFileTypes: true })
  const skillNames = []
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue
    }
    const skillPath = join(bundledSkillsDirectory, entry.name, "SKILL.md")
    if (await fileExists(skillPath)) {
      skillNames.push(entry.name)
    }
  }
  return skillNames.sort((left, right) => left.localeCompare(right))
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
