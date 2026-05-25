import { createHash } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { execa } from "execa"

export const GLOBAL_PROJECT_ID = "global"
export const PROJECT_ID_CACHE_FILE = "opencode-remote"

export async function resolveProjectIdentity({
  directory = process.cwd(),
  runGit = defaultRunGit,
} = {}) {
  const repo = await findGitRepo(directory, runGit)
  if (!repo) {
    return { id: GLOBAL_PROJECT_ID, worktree: "/", vcs: undefined }
  }

  const previous = await readCachedProjectId(repo.store)
  const remote = await gitRemoteProjectId(repo, runGit)
  const root = remote ? undefined : await gitRootProjectId(repo, runGit)
  const id = remote ?? previous ?? root ?? GLOBAL_PROJECT_ID

  if (id !== GLOBAL_PROJECT_ID) {
    await writeCachedProjectId(repo.store, id)
  }

  return {
    id,
    ...(previous && previous !== id ? { previous } : {}),
    worktree: id === GLOBAL_PROJECT_ID ? "/" : repo.directory,
    vcs: "git",
  }
}

async function defaultRunGit(directory, args) {
  try {
    const result = await execa("git", args, {
      cwd: directory,
      reject: false,
      stdin: "ignore",
    })
    return { exitCode: result.exitCode, stdout: result.stdout }
  } catch {
    return { exitCode: 1, stdout: "" }
  }
}

async function findGitRepo(directory, runGit) {
  const topLevel = await safeRunGit(runGit, directory, ["rev-parse", "--show-toplevel"])
  if (topLevel.exitCode !== 0 || !topLevel.stdout.trim()) {
    return null
  }

  const commonDir = await safeRunGit(runGit, directory, ["rev-parse", "--git-common-dir"])
  if (commonDir.exitCode !== 0 || !commonDir.stdout.trim()) {
    return null
  }

  const repoDirectory = normalizeGitPath(directory, topLevel.stdout)
  return {
    directory: repoDirectory,
    store: normalizeGitPath(repoDirectory, commonDir.stdout),
  }
}

async function gitRemoteProjectId(repo, runGit) {
  const result = await safeRunGit(runGit, repo.directory, ["remote", "get-url", "origin"])
  if (result.exitCode !== 0) {
    return undefined
  }
  const normalized = normalizeRemoteUrl(result.stdout)
  return normalized ? `git-remote:${hash(normalized)}` : undefined
}

async function gitRootProjectId(repo, runGit) {
  const result = await safeRunGit(runGit, repo.directory, ["rev-list", "--max-parents=0", "HEAD"])
  if (result.exitCode !== 0) {
    return undefined
  }
  const roots = result.stdout
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean)
    .sort()
  return roots.length ? `git-root:${hash(roots.join("\n"))}` : undefined
}

async function safeRunGit(runGit, directory, args) {
  try {
    return await runGit(directory, args)
  } catch {
    return { exitCode: 1, stdout: "" }
  }
}

async function readCachedProjectId(store) {
  try {
    const value = (await readFile(path.join(store, PROJECT_ID_CACHE_FILE), "utf8")).trim()
    return value || undefined
  } catch {
    return undefined
  }
}

async function writeCachedProjectId(store, id) {
  try {
    await writeFile(path.join(store, PROJECT_ID_CACHE_FILE), `${id}\n`, "utf8")
  } catch {
    // The cache is an optimization; project state still works without it.
  }
}

function normalizeGitPath(cwd, value) {
  const trimmed = value.replace(/[\r\n]+$/, "")
  if (!trimmed) {
    return cwd
  }
  return path.isAbsolute(trimmed) ? path.normalize(trimmed) : path.resolve(cwd, trimmed)
}

export function normalizeRemoteUrl(input) {
  const value = input.trim()
  if (!value) {
    return undefined
  }

  try {
    const parsed = new URL(value)
    if (parsed.protocol === "file:") {
      return undefined
    }
    return remoteParts(parsed.hostname, parsed.pathname)
  } catch {
    const scp = value.match(/^([^@/:]+@)?([^/:]+):(.+)$/)
    return scp ? remoteParts(scp[2], scp[3]) : undefined
  }
}

function remoteParts(host, name) {
  const pathname = name
    .replace(/^\/+/, "")
    .replace(/\.git\/?$/, "")
    .replace(/\/+$/, "")
  if (!host || !pathname) {
    return undefined
  }
  return `${host.toLowerCase()}/${pathname}`
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16)
}
