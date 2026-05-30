import { mkdir, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"

export const GENERATED_SKILL_PARENT = "opencode-remote-generated"

export function sanitizeGeneratedSkillName(name) {
  const raw = String(name ?? "").trim()
  if (!raw) {
    throw new Error("Generated skill name is required")
  }

  const sanitized = raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .replace(/-{2,}/gu, "-")

  if (!sanitized) {
    throw new Error("Generated skill name must contain letters or numbers")
  }
  if (sanitized.length > 64) {
    throw new Error("Generated skill name must be 64 characters or fewer")
  }

  return sanitized
}

export function generatedSkillDestination({
  scope = "project",
  projectRoot = process.cwd(),
  homeDirectory = homedir(),
  name,
  overwrite = false,
} = {}) {
  const skillName = sanitizeGeneratedSkillName(name)
  const baseDirectory =
    scope === "global"
      ? join(homeDirectory, ".config", "opencode", "skills", GENERATED_SKILL_PARENT)
      : join(projectRoot, ".opencode", "skills", GENERATED_SKILL_PARENT)
  const directory = join(baseDirectory, skillName)
  return {
    scope,
    skillName,
    directory,
    filePath: join(directory, "SKILL.md"),
    overwrite: Boolean(overwrite),
  }
}

export function buildGeneratedSkillDocument({ name, description, body } = {}) {
  const skillName = sanitizeGeneratedSkillName(name)
  const cleanedDescription = String(description ?? "").trim()
  const cleanedBody = String(body ?? "").trim()

  if (!cleanedDescription) {
    throw new Error("Generated skill description is required")
  }
  if (!cleanedBody) {
    throw new Error("Generated skill body is required")
  }

  return [
    "---",
    `name: ${skillName}`,
    `description: ${cleanedDescription}`,
    "license: MIT",
    "compatibility: opencode",
    "metadata:",
    "  source: opencode-remote-generated",
    "---",
    "",
    `# ${skillName}`,
    "",
    "This skill was generated through OpenCode Remote and belongs to this OpenCode configuration scope.",
    "",
    "Do not store secrets, raw Telegram IDs, private local paths, raw logs, API keys, or private configuration values in generated skills.",
    "",
    cleanedBody,
    "",
  ].join("\n")
}

export async function createGeneratedSkill({
  scope = "project",
  projectRoot = process.cwd(),
  homeDirectory = homedir(),
  name,
  description,
  body,
  overwrite = false,
} = {}) {
  const destination = generatedSkillDestination({
    scope,
    projectRoot,
    homeDirectory,
    name,
    overwrite,
  })
  const document = buildGeneratedSkillDocument({
    name: destination.skillName,
    description,
    body,
  })

  await mkdir(destination.directory, { recursive: true })
  await writeFile(destination.filePath, document, { flag: overwrite ? "w" : "wx" })
  return destination
}
