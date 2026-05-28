import { mkdirSync } from "node:fs"
import { dirname, posix, win32 } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { getAppDataDir } from "../../core/state/appDataPath.js"
import {
  DEFAULT_GROUP_SETTINGS,
  normalizeCustomTriggers,
  normalizeGroupSettings,
} from "./groupRouting.js"

const GROUP_DB_FILE_NAME = "telegram-groups.db"

export const DEFAULT_GROUP_CONFIG = {
  ...DEFAULT_GROUP_SETTINGS,
  memory: {
    enabled: true,
    storeMessages: 200,
    storeChars: 50_000,
    ttlHours: 24,
  },
  context: {
    messages: 30,
    chars: 12_000,
    overlap: 5,
  },
  reactions: {
    enabled: false,
  },
}

export function getDefaultTelegramGroupDbPath(options = {}) {
  const platform = options.platform ?? process.platform
  const pathApi = platform === "win32" ? win32 : posix
  return pathApi.join(getAppDataDir({ ...options, platform }), GROUP_DB_FILE_NAME)
}

export function openTelegramGroupStore(dbPath, { Database = DatabaseSync, pathOptions = {} } = {}) {
  const resolvedDbPath = dbPath ?? getDefaultTelegramGroupDbPath(pathOptions)
  mkdirSync(dirname(resolvedDbPath), { recursive: true })
  const database = new Database(resolvedDbPath)
  initialize(database)

  return {
    path: resolvedDbPath,
    async listGroups() {
      return listGroups(database)
    },
    async upsertKnownGroup(group) {
      upsertKnownGroup(database, group)
    },
    async markGroupUnavailable(chatId) {
      markGroupUnavailable(database, chatId)
    },
    async getSettings(chatId) {
      return getSettings(database, chatId)
    },
    async updateSettings(chatId, patch) {
      return updateSettings(database, chatId, patch)
    },
    async resetSettings(chatId) {
      return resetSettings(database, chatId)
    },
    async pruneUnallowedGroups(allowedChatIds) {
      pruneUnallowedGroups(database, allowedChatIds)
    },
    close() {
      database.close()
    },
  }
}

export function createMemoryGroupStore({ allowedChatIds = [] } = {}) {
  const groups = new Map()
  const settings = new Map()
  let nextCreated = 1

  for (const chatId of allowedChatIds) {
    groups.set(chatId, {
      chatId,
      title: `Group ${chatId}`,
      username: null,
      type: "supergroup",
      status: "configured",
      timeCreated: nextCreated,
    })
    nextCreated += 1
  }

  return {
    async listGroups() {
      return [...groups.values()]
        .sort((left, right) => left.timeCreated - right.timeCreated)
        .map(publicGroup)
    },
    async upsertKnownGroup(group) {
      const normalized = normalizeGroup(group)
      const existing = groups.get(normalized.chatId)
      groups.set(normalized.chatId, {
        ...existing,
        ...normalized,
        timeCreated: existing?.timeCreated ?? nextCreated,
      })
      if (!existing) {
        nextCreated += 1
      }
    },
    async markGroupUnavailable(chatId) {
      const group = groups.get(chatId) ?? defaultKnownGroup(chatId)
      groups.set(chatId, {
        ...group,
        status: "unavailable",
        timeCreated: group.timeCreated ?? nextCreated,
      })
      if (!group.timeCreated) {
        nextCreated += 1
      }
    },
    async getSettings(chatId) {
      return normalizeGroupConfig(settings.get(chatId))
    },
    async updateSettings(chatId, patch) {
      const next = mergeGroupConfig(normalizeGroupConfig(settings.get(chatId)), patch)
      settings.set(chatId, next)
      return next
    },
    async resetSettings(chatId) {
      settings.delete(chatId)
      return normalizeGroupConfig()
    },
    async pruneUnallowedGroups(allowedChatIds) {
      const allowed = normalizeAllowedChatIds(allowedChatIds)
      if (allowed.length === 0) {
        return
      }
      const allowedSet = new Set(allowed)
      for (const chatId of [...groups.keys()]) {
        if (!allowedSet.has(chatId)) {
          groups.delete(chatId)
          settings.delete(chatId)
        }
      }
    },
    close() {},
  }
}

function initialize(database) {
  database.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS telegram_group (
      chat_id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      username TEXT,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      settings_json TEXT,
      time_created INTEGER NOT NULL,
      time_updated INTEGER NOT NULL
    ) STRICT;
  `)
}

function listGroups(database) {
  return database
    .prepare(
      "SELECT chat_id, title, username, type, status FROM telegram_group ORDER BY time_created ASC",
    )
    .all()
    .map(rowToGroup)
}

function upsertKnownGroup(database, group) {
  const normalized = normalizeGroup(group)
  const existing = getRawGroup(database, normalized.chatId)
  const now = Date.now()
  database
    .prepare(
      `INSERT INTO telegram_group
        (chat_id, title, username, type, status, settings_json, time_created, time_updated)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(chat_id) DO UPDATE SET
        title = excluded.title,
        username = excluded.username,
        type = excluded.type,
        status = excluded.status,
        time_updated = excluded.time_updated`,
    )
    .run(
      normalized.chatId,
      normalized.title,
      normalized.username,
      normalized.type,
      normalized.status,
      existing?.settings_json ?? null,
      existing?.time_created ?? now,
      now,
    )
}

function markGroupUnavailable(database, chatId) {
  const existing = getRawGroup(database, chatId)
  const group = existing ? rowToGroup(existing) : defaultKnownGroup(chatId)
  upsertKnownGroup(database, { ...group, status: "unavailable" })
}

function getSettings(database, chatId) {
  const raw = getRawGroup(database, chatId)?.settings_json
  return normalizeGroupConfig(parseSettings(raw))
}

function updateSettings(database, chatId, patch) {
  const next = mergeGroupConfig(getSettings(database, chatId), patch)
  ensureGroup(database, chatId)
  database
    .prepare("UPDATE telegram_group SET settings_json = ?, time_updated = ? WHERE chat_id = ?")
    .run(JSON.stringify(next), Date.now(), chatId)
  return next
}

function resetSettings(database, chatId) {
  ensureGroup(database, chatId)
  database
    .prepare("UPDATE telegram_group SET settings_json = NULL, time_updated = ? WHERE chat_id = ?")
    .run(Date.now(), chatId)
  return normalizeGroupConfig()
}

function pruneUnallowedGroups(database, allowedChatIds) {
  const allowed = normalizeAllowedChatIds(allowedChatIds)
  if (allowed.length === 0) {
    return
  }

  const placeholders = allowed.map(() => "?").join(", ")
  database
    .prepare(`DELETE FROM telegram_group WHERE chat_id NOT IN (${placeholders})`)
    .run(...allowed)
}

function ensureGroup(database, chatId) {
  if (!getRawGroup(database, chatId)) {
    upsertKnownGroup(database, defaultKnownGroup(chatId))
  }
}

function getRawGroup(database, chatId) {
  return database.prepare("SELECT * FROM telegram_group WHERE chat_id = ?").get(chatId)
}

function normalizeGroup(group = {}) {
  const chatId = Number(group.chatId ?? group.id)
  if (!Number.isInteger(chatId)) {
    throw new Error("Telegram group requires an integer chat ID")
  }
  return {
    chatId,
    title: safeString(group.title) ?? `Group ${chatId}`,
    username: safeString(group.username),
    type: safeString(group.type) ?? "supergroup",
    status: safeString(group.status) ?? "active",
  }
}

function defaultKnownGroup(chatId) {
  return {
    chatId,
    title: `Group ${chatId}`,
    username: null,
    type: "supergroup",
    status: "configured",
  }
}

function rowToGroup(row) {
  return {
    chatId: row.chat_id,
    title: row.title,
    username: row.username ?? null,
    type: row.type,
    status: row.status,
  }
}

function publicGroup(group) {
  return {
    chatId: group.chatId,
    title: group.title,
    username: group.username ?? null,
    type: group.type,
    status: group.status,
  }
}

function parseSettings(raw) {
  if (!raw) {
    return null
  }
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function normalizeGroupConfig(value = {}) {
  return mergeGroupConfig(DEFAULT_GROUP_CONFIG, value)
}

function mergeGroupConfig(base, patch = {}) {
  return {
    ...DEFAULT_GROUP_CONFIG,
    ...base,
    ...patch,
    ...normalizeGroupSettings({ ...base, ...patch }),
    triggers: {
      ...DEFAULT_GROUP_CONFIG.triggers,
      ...(base?.triggers ?? {}),
      ...(patch?.triggers ?? {}),
    },
    customTriggers: normalizeCustomTriggers(
      patch?.customTriggers ?? base?.customTriggers ?? DEFAULT_GROUP_CONFIG.customTriggers,
    ),
    memory: {
      ...DEFAULT_GROUP_CONFIG.memory,
      ...(base?.memory ?? {}),
      ...(patch?.memory ?? {}),
    },
    context: {
      ...DEFAULT_GROUP_CONFIG.context,
      ...(base?.context ?? {}),
      ...(patch?.context ?? {}),
    },
    reactions: {
      ...DEFAULT_GROUP_CONFIG.reactions,
      ...(base?.reactions ?? {}),
      ...(patch?.reactions ?? {}),
    },
  }
}

function safeString(value) {
  const text = String(value ?? "").trim()
  return text || null
}

function normalizeAllowedChatIds(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter(Number.isInteger))]
}
