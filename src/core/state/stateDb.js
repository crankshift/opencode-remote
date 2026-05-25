import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { getDefaultStateDbPath } from "./appDataPath.js"

const defaultState = {
  activeSessionId: null,
}

export function openStateDb(dbPath, { Database = DatabaseSync, pathOptions = {} } = {}) {
  dbPath ??= getDefaultStateDbPath(pathOptions)
  mkdirSync(dirname(dbPath), { recursive: true })
  const database = new Database(dbPath)
  initialize(database)

  return {
    path: dbPath,

    upsertProject(project) {
      upsertProject(database, project)
    },

    migrateProject(previousId, nextId) {
      migrateProject(database, previousId, nextId)
    },

    readProjectState(projectId) {
      return readProjectState(database, projectId)
    },

    writeProjectState(projectId, settings) {
      writeProjectState(database, projectId, settings)
    },

    close() {
      database.close()
    },
  }
}

export function createProjectStateStore({ db, dbPath, project, stateSuffix } = {}) {
  if (!project?.id) {
    throw new Error("Project state store requires a project identity")
  }

  const database = db ?? openStateDb(dbPath, { pathOptions: { suffix: stateSuffix } })
  database.upsertProject(project)
  database.migrateProject(project.previous, project.id)
  database.upsertProject(project)

  return {
    async read() {
      return database.readProjectState(project.id)
    },

    async write(settings) {
      database.writeProjectState(project.id, settings)
    },
  }
}

function initialize(database) {
  database.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS project (
      id TEXT PRIMARY KEY,
      worktree TEXT NOT NULL,
      vcs TEXT,
      time_created INTEGER NOT NULL,
      time_updated INTEGER NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS project_state (
      project_id TEXT PRIMARY KEY REFERENCES project(id) ON DELETE CASCADE,
      active_session_id TEXT,
      progress_verbosity TEXT,
      time_created INTEGER NOT NULL,
      time_updated INTEGER NOT NULL
    ) STRICT;
  `)
}

function upsertProject(database, project) {
  const now = Date.now()
  const existing = getProject(database, project.id)
  if (!existing) {
    database
      .prepare(
        "INSERT INTO project (id, worktree, vcs, time_created, time_updated) VALUES (?, ?, ?, ?, ?)",
      )
      .run(project.id, project.worktree, project.vcs ?? null, now, now)
    return
  }

  const worktreeChanged = existing.worktree !== project.worktree
  const vcsChanged = existing.vcs !== (project.vcs ?? null)
  if (!worktreeChanged && !vcsChanged) {
    return
  }

  database
    .prepare("UPDATE project SET worktree = ?, vcs = ?, time_updated = ? WHERE id = ?")
    .run(project.worktree, project.vcs ?? null, now, project.id)
  if (worktreeChanged) {
    database
      .prepare(
        "UPDATE project_state SET active_session_id = NULL, time_updated = ? WHERE project_id = ?",
      )
      .run(now, project.id)
  }
}

function migrateProject(database, previousId, nextId) {
  const oldProject = previousId ? getProject(database, previousId) : null
  if (!previousId || previousId === nextId || !oldProject) {
    return
  }

  const oldState = getRawProjectState(database, previousId)
  if (oldState) {
    const newState = getRawProjectState(database, nextId)
    const newProject = getProject(database, nextId)
    const worktreeChanged = Boolean(newProject && oldProject.worktree !== newProject.worktree)
    const now = Date.now()
    writeRawProjectState(database, nextId, {
      activeSessionId: worktreeChanged
        ? null
        : (newState?.active_session_id ?? oldState.active_session_id ?? null),
      progressVerbosity: newState?.progress_verbosity ?? oldState.progress_verbosity ?? null,
      timeCreated: newState?.time_created ?? oldState.time_created ?? now,
      timeUpdated: now,
    })
  }

  database.prepare("DELETE FROM project WHERE id = ?").run(previousId)
}

function readProjectState(database, projectId) {
  const row = getRawProjectState(database, projectId)
  if (!row) {
    return { ...defaultState }
  }

  const settings = { activeSessionId: row.active_session_id ?? null }
  if (row.progress_verbosity) {
    settings.progressVerbosity = row.progress_verbosity
  }
  return settings
}

function writeProjectState(database, projectId, settings) {
  const current = readProjectState(database, projectId)
  const next = { ...current, ...settings }
  const existing = getRawProjectState(database, projectId)
  const now = Date.now()
  writeRawProjectState(database, projectId, {
    activeSessionId: next.activeSessionId ?? null,
    progressVerbosity: next.progressVerbosity ?? null,
    timeCreated: existing?.time_created ?? now,
    timeUpdated: now,
  })
}

function writeRawProjectState(database, projectId, state) {
  const existing = getRawProjectState(database, projectId)
  if (!existing) {
    database
      .prepare(
        "INSERT INTO project_state (project_id, active_session_id, progress_verbosity, time_created, time_updated) VALUES (?, ?, ?, ?, ?)",
      )
      .run(
        projectId,
        state.activeSessionId,
        state.progressVerbosity,
        state.timeCreated,
        state.timeUpdated,
      )
    return
  }

  database
    .prepare(
      "UPDATE project_state SET active_session_id = ?, progress_verbosity = ?, time_updated = ? WHERE project_id = ?",
    )
    .run(state.activeSessionId, state.progressVerbosity, state.timeUpdated, projectId)
}

function getProject(database, projectId) {
  return database.prepare("SELECT id, worktree, vcs FROM project WHERE id = ?").get(projectId)
}

function getRawProjectState(database, projectId) {
  return database
    .prepare(
      "SELECT active_session_id, progress_verbosity, time_created, time_updated FROM project_state WHERE project_id = ?",
    )
    .get(projectId)
}
