import { readdir, readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { GENERATED_SKILL_PARENT } from "./generatedSkills.js"

const PROJECT_CONFIG_FILES = ["opencode.json", "opencode.jsonc", join(".opencode", "opencode.json")]
const BUNDLED_SKILLS_SOURCE = "opencode-remote-bundled"
const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..")
const DEFAULT_BUNDLED_SKILLS_DIRECTORY = join(PACKAGE_ROOT, "bundled-skills")

export async function discoverOpenCodeSkills({
  projectRoot = process.cwd(),
  homeDirectory = homedir(),
  bundledSkillsDirectory = DEFAULT_BUNDLED_SKILLS_DIRECTORY,
} = {}) {
  const sources = []
  const remoteSkillUrls = []
  const ignoredConfigDirectories = bundledSkillsDirectory
    ? [join(dirname(bundledSkillsDirectory), "skills", "development")]
    : []

  if (bundledSkillsDirectory) {
    sources.push({
      scope: "bundled",
      source: BUNDLED_SKILLS_SOURCE,
      directory: bundledSkillsDirectory,
    })
  }

  sources.push(
    { scope: "project", source: "default", directory: join(projectRoot, ".opencode", "skills") },
    { scope: "project", source: "default", directory: join(projectRoot, ".opencode", "skill") },
    {
      scope: "project",
      source: "claude-compatible",
      directory: join(projectRoot, ".claude", "skills"),
    },
    {
      scope: "project",
      source: "agents-compatible",
      directory: join(projectRoot, ".agents", "skills"),
    },
    {
      scope: "global",
      source: "claude-compatible",
      directory: join(homeDirectory, ".claude", "skills"),
    },
    {
      scope: "global",
      source: "agents-compatible",
      directory: join(homeDirectory, ".agents", "skills"),
    },
  )

  for (const configPath of PROJECT_CONFIG_FILES.map((path) => join(projectRoot, path))) {
    const config = await readConfig(configPath)
    if (config) {
      addConfigSkillSources({
        sources,
        remoteSkillUrls,
        config,
        configPath,
        scope: "project",
        ignoredDirectories: ignoredConfigDirectories,
      })
    }
  }

  const globalConfigPath = join(homeDirectory, ".config", "opencode", "opencode.json")
  const globalConfig = await readConfig(globalConfigPath)
  if (globalConfig) {
    addConfigSkillSources({
      sources,
      remoteSkillUrls,
      config: globalConfig,
      configPath: globalConfigPath,
      scope: "global",
    })
  }

  const skillsByPath = new Map()
  for (const source of sources) {
    for (const skillPath of await listSkillFiles(source.directory)) {
      if (skillsByPath.has(skillPath)) {
        continue
      }
      const skill = await readSkill(skillPath, source)
      if (skill) {
        skillsByPath.set(skillPath, skill)
      }
    }
  }

  return {
    skills: [...skillsByPath.values()].sort((left, right) => left.name.localeCompare(right.name)),
    remoteSkillUrls: [...new Set(remoteSkillUrls)],
  }
}

function addConfigSkillSources({
  sources,
  remoteSkillUrls,
  config,
  configPath,
  scope,
  ignoredDirectories = [],
}) {
  const skillConfig = config.skills
  if (!skillConfig || typeof skillConfig !== "object") {
    return
  }

  for (const path of Array.isArray(skillConfig.paths) ? skillConfig.paths : []) {
    if (typeof path !== "string" || !path.trim()) {
      continue
    }
    const directory = resolve(dirname(configPath), path)
    if (isIgnoredDirectory(directory, ignoredDirectories)) {
      continue
    }
    sources.push({
      scope,
      source: "config-path",
      directory,
    })
  }

  for (const url of Array.isArray(skillConfig.urls) ? skillConfig.urls : []) {
    if (typeof url === "string" && url.trim()) {
      remoteSkillUrls.push(url)
    }
  }
}

function isIgnoredDirectory(directory, ignoredDirectories = []) {
  const normalizedDirectory = resolve(directory)
  return ignoredDirectories.some(
    (ignoredDirectory) => resolve(ignoredDirectory) === normalizedDirectory,
  )
}

async function readConfig(filePath) {
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

async function listSkillFiles(directory) {
  const files = []
  await collectSkillFiles(directory, files)
  return files
}

async function collectSkillFiles(directory, files) {
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") {
      return
    }
    throw error
  }

  for (const entry of entries) {
    const entryPath = join(directory, entry.name)
    if (entry.isDirectory()) {
      await collectSkillFiles(entryPath, files)
    } else if (entry.isFile() && entry.name === "SKILL.md") {
      files.push(entryPath)
    }
  }
}

async function readSkill(filePath, source) {
  const content = await readFile(filePath, "utf8")
  const frontmatter = parseFrontmatter(content)
  const name = frontmatter.name ?? dirname(filePath).split(sep).at(-1)
  if (!name) {
    return null
  }
  const generated = filePath.split(sep).includes(GENERATED_SKILL_PARENT)
  return {
    name,
    description: frontmatter.description ?? "No description provided.",
    filePath,
    directory: dirname(filePath),
    scope: source.scope,
    source: generated ? GENERATED_SKILL_PARENT : source.source,
    generated,
  }
}

function parseFrontmatter(content) {
  const match = /^---\n(?<body>[\s\S]*?)\n---/u.exec(content)
  if (!match?.groups?.body) {
    return {}
  }
  const fields = {}
  for (const line of match.groups.body.split("\n")) {
    const separator = line.indexOf(":")
    if (separator <= 0 || line.startsWith(" ")) {
      continue
    }
    fields[line.slice(0, separator).trim()] = line.slice(separator + 1).trim()
  }
  return fields
}
