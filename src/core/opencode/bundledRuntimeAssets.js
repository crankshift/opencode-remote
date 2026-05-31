import { access, copyFile, mkdir, readdir, readFile, rm, stat } from "node:fs/promises"
import { dirname, isAbsolute, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..")
const DEFAULT_BUNDLED_SKILLS_DIRECTORY = join(PACKAGE_ROOT, "bundled-skills")
const PROJECT_CONFIG_FILES = ["opencode.json", "opencode.jsonc", join(".opencode", "opencode.json")]

export const BUNDLED_MEME_SKILL_NAME = "meme-generation"
const BUNDLED_RUNTIME_SKILLS_PARENT = "opencode-remote-bundled"
const LEGACY_BUNDLED_MEME_AGENT_NAME = "opencode-remote-meme"

export function bundledMemeRuntimeAssetPaths({
  projectRoot = process.cwd(),
  bundledSkillsDirectory = DEFAULT_BUNDLED_SKILLS_DIRECTORY,
  runtimeSkillsDirectory,
} = {}) {
  const skill = bundledSkillRuntimeAssetPaths({
    projectRoot,
    bundledSkillsDirectory,
    runtimeSkillsDirectory,
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
  runtimeSkillsDirectory = defaultRuntimeSkillsDirectory(projectRoot),
  skillName,
} = {}) {
  return {
    sourcePath: join(bundledSkillsDirectory, skillName, "SKILL.md"),
    projectPath: join(runtimeSkillsDirectory, BUNDLED_RUNTIME_SKILLS_PARENT, skillName, "SKILL.md"),
  }
}

export async function bundledMemeRuntimeStatus(options = {}) {
  const runtimeSkillsDirectory = await resolveRuntimeSkillsDirectory(options)
  const paths = bundledMemeRuntimeAssetPaths({ ...options, runtimeSkillsDirectory })
  const skillEnabled = await fileExists(paths.skill.projectPath)
  const legacyAgentEnabled = await fileExists(paths.legacyAgent.projectPath)

  return {
    enabled: skillEnabled,
    skill: { ...paths.skill, enabled: skillEnabled },
    legacyAgent: { ...paths.legacyAgent, enabled: legacyAgentEnabled },
  }
}

export async function installBundledRuntimeSkillsForProject(options = {}) {
  const runtimeSkillsDirectory = await resolveRuntimeSkillsDirectory(options)
  const paths = bundledMemeRuntimeAssetPaths({ ...options, runtimeSkillsDirectory })
  await assertReadableFile(paths.skill.sourcePath)

  const writtenPaths = []
  const skillNames = await listBundledSkillNames(
    options.bundledSkillsDirectory ?? DEFAULT_BUNDLED_SKILLS_DIRECTORY,
  )
  for (const skillName of skillNames) {
    const skillPaths = bundledSkillRuntimeAssetPaths({
      ...options,
      runtimeSkillsDirectory,
      skillName,
    })
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

async function resolveRuntimeSkillsDirectory({ projectRoot = process.cwd() } = {}) {
  for (const configPath of PROJECT_CONFIG_FILES.map((path) => join(projectRoot, path))) {
    const config = await readOpenCodeConfig(configPath)
    const paths = config?.skills?.paths
    if (!Array.isArray(paths)) {
      continue
    }
    for (const path of paths) {
      if (typeof path !== "string" || !path.trim()) {
        continue
      }
      const directory = resolve(dirname(configPath), path)
      if (isProjectLocalPath(directory, projectRoot)) {
        return directory
      }
    }
  }
  return defaultRuntimeSkillsDirectory(projectRoot)
}

async function readOpenCodeConfig(filePath) {
  try {
    return JSON.parse(stripJsonComments(await readFile(filePath, "utf8")))
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null
    }
    throw error
  }
}

function stripJsonComments(text) {
  return String(text).replace(/(^|\s)\/\/.*$/gmu, "$1")
}

function isProjectLocalPath(filePath, projectRoot) {
  const relativePath = relative(resolve(projectRoot), resolve(filePath))
  return relativePath === "" || (!relativePath.startsWith("..") && !isAbsolute(relativePath))
}

function defaultRuntimeSkillsDirectory(projectRoot = process.cwd()) {
  return join(projectRoot, ".opencode", "skills")
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
