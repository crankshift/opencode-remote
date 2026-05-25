import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, test } from "vitest"
import {
  PROJECT_ID_CACHE_FILE,
  resolveProjectIdentity,
} from "../../src/core/state/projectIdentity.js"

const tempDirs = []

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })))
  tempDirs.length = 0
})

describe("project identity", () => {
  test("normalizes HTTPS and SSH Git remotes to the same project ID", async () => {
    const https = await resolveProjectIdentity({
      directory: "/workspace/app",
      runGit: fakeGit({ remote: "https://github.com/Org/Repo.git" }),
    })
    const ssh = await resolveProjectIdentity({
      directory: "/workspace/app-moved",
      runGit: fakeGit({
        topLevel: "/workspace/app-moved",
        commonDir: "/workspace/app-moved/.git",
        remote: "git@github.com:Org/Repo.git",
      }),
    })

    expect(https.id).toBe(ssh.id)
    expect(https.id).toMatch(/^git-remote:/)
    expect(https.worktree).toBe("/workspace/app")
    expect(https.vcs).toBe("git")
  })

  test("uses the cached project ID when no remote is available", async () => {
    const store = await tempGitStore()
    await writeFile(join(store, PROJECT_ID_CACHE_FILE), "cached-project\n", "utf8")

    const identity = await resolveProjectIdentity({
      directory: "/workspace/app",
      runGit: fakeGit({ commonDir: store, remoteExitCode: 1, root: "root-commit" }),
    })

    expect(identity).toMatchObject({
      id: "cached-project",
      worktree: "/workspace/app",
      vcs: "git",
    })
  })

  test("uses the root commit and writes it to the Git cache when no remote or cache exists", async () => {
    const store = await tempGitStore()

    const identity = await resolveProjectIdentity({
      directory: "/workspace/app",
      runGit: fakeGit({ commonDir: store, remoteExitCode: 1, root: "root-commit" }),
    })

    expect(identity.id).toMatch(/^git-root:/)
    await expect(readFile(join(store, PROJECT_ID_CACHE_FILE), "utf8")).resolves.toBe(
      `${identity.id}\n`,
    )
  })

  test("reports the previous cached ID when a remote ID replaces a fallback ID", async () => {
    const store = await tempGitStore()
    await writeFile(join(store, PROJECT_ID_CACHE_FILE), "git-root:old\n", "utf8")

    const identity = await resolveProjectIdentity({
      directory: "/workspace/app",
      runGit: fakeGit({ commonDir: store, remote: "https://github.com/Org/Repo.git" }),
    })

    expect(identity.id).toMatch(/^git-remote:/)
    expect(identity.previous).toBe("git-root:old")
    await expect(readFile(join(store, PROJECT_ID_CACHE_FILE), "utf8")).resolves.toBe(
      `${identity.id}\n`,
    )
  })

  test("uses the global project for non-Git directories", async () => {
    await expect(
      resolveProjectIdentity({
        directory: "/workspace/no-git",
        runGit: fakeGit({ topLevelExitCode: 1 }),
      }),
    ).resolves.toEqual({ id: "global", worktree: "/", vcs: undefined })
  })

  test("uses the global project when Git commands fail unexpectedly", async () => {
    await expect(
      resolveProjectIdentity({
        directory: "/workspace/no-git-command",
        runGit: async () => {
          throw new Error("git not found")
        },
      }),
    ).resolves.toEqual({ id: "global", worktree: "/", vcs: undefined })
  })
})

async function tempGitStore() {
  const dir = await mkdtemp(join(tmpdir(), "opencode-remote-git-store-"))
  tempDirs.push(dir)
  await mkdir(dir, { recursive: true })
  return dir
}

function fakeGit({
  topLevel = "/workspace/app",
  topLevelExitCode = 0,
  commonDir = "/workspace/app/.git",
  commonDirExitCode = 0,
  remote = "",
  remoteExitCode = 0,
  root = "root-commit",
  rootExitCode = 0,
} = {}) {
  return async (_directory, args) => {
    if (args.join(" ") === "rev-parse --show-toplevel") {
      return { exitCode: topLevelExitCode, stdout: topLevel }
    }
    if (args.join(" ") === "rev-parse --git-common-dir") {
      return { exitCode: commonDirExitCode, stdout: commonDir }
    }
    if (args.join(" ") === "remote get-url origin") {
      return { exitCode: remoteExitCode, stdout: remote }
    }
    if (args.join(" ") === "rev-list --max-parents=0 HEAD") {
      return { exitCode: rootExitCode, stdout: root }
    }
    throw new Error(`Unexpected git args: ${args.join(" ")}`)
  }
}
