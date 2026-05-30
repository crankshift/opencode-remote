import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, test, vi } from "vitest"
import { createProjectStateStore, openStateDb } from "../../src/core/state/stateDb.js"

const tempDirs = []
const openDbs = []

afterEach(async () => {
  for (const db of openDbs.splice(0)) {
    db.close()
  }
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })))
  tempDirs.length = 0
})

describe("stateDb", () => {
  test("returns defaults when project state does not exist", async () => {
    const store = await tempStore({ id: "project-1", worktree: "/project", vcs: "git" })

    await expect(store.read()).resolves.toEqual({ activeSessionId: null })
  })

  test("persists active session ID and progress verbosity", async () => {
    const store = await tempStore({ id: "project-1", worktree: "/project", vcs: "git" })

    await store.write({ activeSessionId: "ses_123" })
    await store.write({ progressVerbosity: "verbose" })

    await expect(store.read()).resolves.toEqual({
      activeSessionId: "ses_123",
      progressVerbosity: "verbose",
    })
  })

  test("scopes state by project ID", async () => {
    const db = await tempDb()
    const first = createProjectStateStore({
      db,
      project: { id: "project-1", worktree: "/project-1", vcs: "git" },
    })
    const second = createProjectStateStore({
      db,
      project: { id: "project-2", worktree: "/project-2", vcs: "git" },
    })

    await first.write({ activeSessionId: "ses_1" })

    await expect(first.read()).resolves.toEqual({ activeSessionId: "ses_1" })
    await expect(second.read()).resolves.toEqual({ activeSessionId: null })
  })

  test("clears active session but preserves progress when a project worktree moves", async () => {
    const db = await tempDb()
    const oldStore = createProjectStateStore({
      db,
      project: { id: "project-1", worktree: "/old/project", vcs: "git" },
    })
    await oldStore.write({ activeSessionId: "ses_old", progressVerbosity: "verbose" })

    const movedStore = createProjectStateStore({
      db,
      project: { id: "project-1", worktree: "/new/project", vcs: "git" },
    })

    await expect(movedStore.read()).resolves.toEqual({
      activeSessionId: null,
      progressVerbosity: "verbose",
    })
  })

  test("migrates state from a previous project ID", async () => {
    const db = await tempDb()
    const oldStore = createProjectStateStore({
      db,
      project: { id: "git-root:old", worktree: "/project", vcs: "git" },
    })
    await oldStore.write({ activeSessionId: "ses_123", progressVerbosity: "all" })

    const newStore = createProjectStateStore({
      db,
      project: {
        id: "git-remote:new",
        previous: "git-root:old",
        worktree: "/project",
        vcs: "git",
      },
    })

    await expect(newStore.read()).resolves.toEqual({
      activeSessionId: "ses_123",
      progressVerbosity: "all",
    })
    await expect(oldStore.read()).resolves.toEqual({ activeSessionId: null })
  })

  test("opens a suffixed default database path", async () => {
    const dir = await mkdtemp(join(tmpdir(), "opencode-remote-state-db-path-"))
    tempDirs.push(dir)
    const Database = class {
      constructor(path) {
        this.path = path
      }

      exec() {}

      close() {}
    }

    const db = openStateDb(undefined, {
      Database,
      pathOptions: {
        platform: "linux",
        env: { XDG_DATA_HOME: dir },
        homeDir: dir,
        suffix: "dev",
      },
    })

    expect(db.path).toBe(join(dir, "opencode-remote", "opencode-remote-dev.db"))
  })

  test("logs safe state database and project lifecycle", async () => {
    const logger = { debug: vi.fn() }
    const db = await tempDb({ logger })
    const store = createProjectStateStore({
      db,
      logger,
      project: { id: "project-1", worktree: "/private/project", vcs: "git" },
    })

    await store.write({ activeSessionId: "ses_private", progressVerbosity: "verbose" })
    await store.read()

    expect(logger.debug).toHaveBeenCalledWith({ hasCustomPath: true }, "State database opened")
    expect(logger.debug).toHaveBeenCalledWith(
      { hasPreviousProject: false, projectScoped: true, vcs: "git" },
      "Project state store initialized",
    )
    expect(logger.debug).toHaveBeenCalledWith(
      { hasActiveSession: true, hasProgressVerbosity: true },
      "Project state written",
    )
    expect(logger.debug).toHaveBeenCalledWith(
      { hasActiveSession: true, hasProgressVerbosity: true },
      "Project state read",
    )
    expect(JSON.stringify(logger.debug.mock.calls)).not.toContain("/private/project")
    expect(JSON.stringify(logger.debug.mock.calls)).not.toContain("ses_private")
  })

  test("clears migrated active session when the migrated project moved", async () => {
    const db = await tempDb()
    const oldStore = createProjectStateStore({
      db,
      project: { id: "git-root:old", worktree: "/old/project", vcs: "git" },
    })
    await oldStore.write({ activeSessionId: "ses_old", progressVerbosity: "verbose" })

    const newStore = createProjectStateStore({
      db,
      project: {
        id: "git-remote:new",
        previous: "git-root:old",
        worktree: "/new/project",
        vcs: "git",
      },
    })

    await expect(newStore.read()).resolves.toEqual({
      activeSessionId: null,
      progressVerbosity: "verbose",
    })
  })
})

async function tempDb(options = {}) {
  const dir = await mkdtemp(join(tmpdir(), "opencode-remote-state-db-"))
  tempDirs.push(dir)
  const db = openStateDb(join(dir, "nested", "opencode-remote.db"), options)
  openDbs.push(db)
  return db
}

async function tempStore(project) {
  return createProjectStateStore({ db: await tempDb(), project })
}
