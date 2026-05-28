import { mkdirSync } from "node:fs"
import { dirname, posix, win32 } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { getAppDataDir } from "../../core/state/appDataPath.js"

const STICKER_DB_FILE_NAME = "telegram-stickers.db"

export function getDefaultTelegramStickerDbPath(options = {}) {
  const platform = options.platform ?? process.platform
  const pathApi = platform === "win32" ? win32 : posix
  return pathApi.join(getAppDataDir({ ...options, platform }), STICKER_DB_FILE_NAME)
}

export function openTelegramStickerStore(
  dbPath,
  { Database = DatabaseSync, pathOptions = {} } = {},
) {
  const resolvedDbPath = dbPath ?? getDefaultTelegramStickerDbPath(pathOptions)
  mkdirSync(dirname(resolvedDbPath), { recursive: true })
  const database = new Database(resolvedDbPath)
  initialize(database)

  return {
    path: resolvedDbPath,
    async savePack(pack) {
      savePack(database, pack)
    },
    async listPacks() {
      return listPacks(database)
    },
    async listStickerCatalog() {
      return listStickerCatalog(listSavedStickers(database))
    },
    async hasSavedPack(name) {
      return Boolean(getSavedPack(database, name))
    },
    async forgetPack(name) {
      return forgetPack(database, name)
    },
    async findStickerForEmoji(emoji, options) {
      return findStickerForEmoji(listSavedStickers(database), emoji, options)
    },
    async findStickerForSelector(selector, options) {
      return findStickerForSelector(listSavedStickers(database), selector, options)
    },
    async upsertSeenSticker(sticker) {
      upsertSeenSticker(database, sticker)
    },
    async getSeenSticker(fileUniqueId) {
      return rowToSticker(getSeenSticker(database, fileUniqueId))
    },
    async updateStickerDescription(fileUniqueId, description) {
      updateStickerDescription(database, fileUniqueId, description)
    },
    async writeCacheRecord(record) {
      writeCacheRecord(database, record)
    },
    async readCacheRecord(fileUniqueId, kind) {
      return rowToCacheRecord(getCacheRecord(database, fileUniqueId, kind))
    },
    close() {
      database.close()
    },
  }
}

export function createMemoryStickerStore() {
  const packs = new Map()
  const stickers = new Map()
  const seen = new Map()
  const cacheRecords = new Map()

  return {
    async savePack(pack) {
      const name = normalizePackName(pack?.name)
      const normalizedStickers = normalizeStickerList(pack?.stickers, name)
      packs.set(name, { name })
      for (const sticker of normalizedStickers) {
        const stickerWithDescription = preserveDescription(
          sticker,
          stickers.get(sticker.fileUniqueId) ?? seen.get(sticker.fileUniqueId),
        )
        stickers.set(sticker.fileUniqueId, stickerWithDescription)
        seen.set(sticker.fileUniqueId, stickerWithDescription)
      }
    },
    async listPacks() {
      return listPackSummaries([...packs.keys()], [...stickers.values()])
    },
    async listStickerCatalog() {
      return listStickerCatalog([...stickers.values()])
    },
    async hasSavedPack(name) {
      return packs.has(name)
    },
    async forgetPack(name) {
      if (!packs.has(name)) {
        return { deleted: false, cacheRecords: [] }
      }
      const forgottenIds = [...stickers.values()]
        .filter((sticker) => sticker.packName === name)
        .map((sticker) => sticker.fileUniqueId)
      const records = [...cacheRecords.values()].filter(
        (record) => record.packName === name || forgottenIds.includes(record.fileUniqueId),
      )
      packs.delete(name)
      for (const fileUniqueId of forgottenIds) {
        stickers.delete(fileUniqueId)
      }
      for (const record of records) {
        cacheRecords.delete(cacheKey(record.fileUniqueId, record.kind))
      }
      return { deleted: true, cacheRecords: records }
    },
    async findStickerForEmoji(emoji, options) {
      return findStickerForEmoji([...stickers.values()], emoji, options)
    },
    async findStickerForSelector(selector, options) {
      return findStickerForSelector([...stickers.values()], selector, options)
    },
    async upsertSeenSticker(sticker) {
      const normalized = normalizeSticker(sticker)
      const previous = seen.get(normalized.fileUniqueId)
      seen.set(normalized.fileUniqueId, preserveDescription(normalized, previous))
    },
    async getSeenSticker(fileUniqueId) {
      return seen.get(fileUniqueId) ?? null
    },
    async updateStickerDescription(fileUniqueId, description) {
      const normalizedDescription = normalizeDescription(description)
      for (const collection of [stickers, seen]) {
        const sticker = collection.get(fileUniqueId)
        if (sticker) {
          collection.set(fileUniqueId, { ...sticker, description: normalizedDescription })
        }
      }
    },
    async writeCacheRecord(record) {
      const normalized = normalizeCacheRecord(record)
      cacheRecords.set(cacheKey(normalized.fileUniqueId, normalized.kind), normalized)
    },
    async readCacheRecord(fileUniqueId, kind) {
      return cacheRecords.get(cacheKey(fileUniqueId, kind)) ?? null
    },
    close() {},
  }
}

function initialize(database) {
  database.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS saved_pack (
      name TEXT PRIMARY KEY,
      time_created INTEGER NOT NULL,
      time_updated INTEGER NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS saved_sticker (
      file_unique_id TEXT PRIMARY KEY,
      pack_name TEXT NOT NULL REFERENCES saved_pack(name) ON DELETE CASCADE,
      file_id TEXT NOT NULL,
      emoji TEXT,
      description TEXT,
      kind TEXT NOT NULL,
      width INTEGER,
      height INTEGER,
      file_size INTEGER,
      time_created INTEGER NOT NULL,
      time_updated INTEGER NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS seen_sticker (
      file_unique_id TEXT PRIMARY KEY,
      pack_name TEXT,
      file_id TEXT NOT NULL,
      emoji TEXT,
      description TEXT,
      kind TEXT NOT NULL,
      width INTEGER,
      height INTEGER,
      file_size INTEGER,
      time_created INTEGER NOT NULL,
      time_updated INTEGER NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS sticker_cache (
      file_unique_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      pack_name TEXT,
      width INTEGER,
      height INTEGER,
      file_size INTEGER,
      converter_version TEXT NOT NULL,
      file_path TEXT NOT NULL,
      time_created INTEGER NOT NULL,
      time_updated INTEGER NOT NULL,
      PRIMARY KEY (file_unique_id, kind)
    ) STRICT;
  `)
  ensureColumn(database, "saved_sticker", "description", "TEXT")
  ensureColumn(database, "seen_sticker", "description", "TEXT")
}

function ensureColumn(database, table, column, definition) {
  const columns = database.prepare(`PRAGMA table_info(${table})`).all()
  if (columns.some((row) => row.name === column)) {
    return
  }
  database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
}

function savePack(database, pack) {
  const name = normalizePackName(pack?.name)
  const stickers = normalizeStickerList(pack?.stickers, name)
  const now = Date.now()
  database
    .prepare(
      `INSERT INTO saved_pack (name, time_created, time_updated)
       VALUES (?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET time_updated = excluded.time_updated`,
    )
    .run(name, now, now)

  for (const sticker of stickers) {
    const previousSeenSticker = rowToSticker(getSeenSticker(database, sticker.fileUniqueId))
    const stickerWithDescription = preserveDescription(sticker, previousSeenSticker)
    upsertSeenSticker(database, stickerWithDescription)
    database
      .prepare(
        `INSERT INTO saved_sticker
          (file_unique_id, pack_name, file_id, emoji, description, kind, width, height, file_size, time_created, time_updated)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(file_unique_id) DO UPDATE SET
          pack_name = excluded.pack_name,
          file_id = excluded.file_id,
          emoji = excluded.emoji,
          description = COALESCE(excluded.description, saved_sticker.description),
          kind = excluded.kind,
          width = excluded.width,
          height = excluded.height,
          file_size = excluded.file_size,
          time_updated = excluded.time_updated`,
      )
      .run(
        stickerWithDescription.fileUniqueId,
        stickerWithDescription.packName,
        stickerWithDescription.fileId,
        stickerWithDescription.emoji,
        stickerWithDescription.description,
        stickerWithDescription.kind,
        stickerWithDescription.width,
        stickerWithDescription.height,
        stickerWithDescription.fileSize,
        now,
        now,
      )
  }
}

function listPacks(database) {
  const packNames = database
    .prepare("SELECT name FROM saved_pack ORDER BY name")
    .all()
    .map((row) => row.name)
  return listPackSummaries(packNames, listSavedStickers(database))
}

function getSavedPack(database, name) {
  return database.prepare("SELECT name FROM saved_pack WHERE name = ?").get(name)
}

function forgetPack(database, name) {
  if (!getSavedPack(database, name)) {
    return { deleted: false, cacheRecords: [] }
  }
  const cacheRecords = database
    .prepare(
      `SELECT file_unique_id, kind, pack_name, width, height, file_size, converter_version, file_path
       FROM sticker_cache
       WHERE pack_name = ? OR file_unique_id IN (
        SELECT file_unique_id FROM saved_sticker WHERE pack_name = ?
       )`,
    )
    .all(name, name)
    .map(rowToCacheRecord)
  database.prepare("DELETE FROM saved_pack WHERE name = ?").run(name)
  for (const record of cacheRecords) {
    database
      .prepare("DELETE FROM sticker_cache WHERE file_unique_id = ? AND kind = ?")
      .run(record.fileUniqueId, record.kind)
  }
  return { deleted: true, cacheRecords }
}

function listSavedStickers(database) {
  return database
    .prepare(
      `SELECT file_unique_id, pack_name, file_id, emoji, description, kind, width, height, file_size
       FROM saved_sticker
       ORDER BY rowid`,
    )
    .all()
    .map(rowToSticker)
}

function upsertSeenSticker(database, sticker) {
  const normalized = normalizeSticker(sticker)
  const now = Date.now()
  database
    .prepare(
      `INSERT INTO seen_sticker
        (file_unique_id, pack_name, file_id, emoji, description, kind, width, height, file_size, time_created, time_updated)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(file_unique_id) DO UPDATE SET
        pack_name = excluded.pack_name,
        file_id = excluded.file_id,
        emoji = excluded.emoji,
        description = COALESCE(excluded.description, seen_sticker.description),
        kind = excluded.kind,
        width = excluded.width,
        height = excluded.height,
        file_size = excluded.file_size,
        time_updated = excluded.time_updated`,
    )
    .run(
      normalized.fileUniqueId,
      normalized.packName,
      normalized.fileId,
      normalized.emoji,
      normalized.description,
      normalized.kind,
      normalized.width,
      normalized.height,
      normalized.fileSize,
      now,
      now,
    )
}

function getSeenSticker(database, fileUniqueId) {
  return database
    .prepare(
      `SELECT file_unique_id, pack_name, file_id, emoji, description, kind, width, height, file_size
       FROM seen_sticker WHERE file_unique_id = ?`,
    )
    .get(fileUniqueId)
}

function updateStickerDescription(database, fileUniqueId, description) {
  const normalizedDescription = normalizeDescription(description)
  database
    .prepare("UPDATE seen_sticker SET description = ?, time_updated = ? WHERE file_unique_id = ?")
    .run(normalizedDescription, Date.now(), fileUniqueId)
  database
    .prepare("UPDATE saved_sticker SET description = ?, time_updated = ? WHERE file_unique_id = ?")
    .run(normalizedDescription, Date.now(), fileUniqueId)
}

function writeCacheRecord(database, record) {
  const normalized = normalizeCacheRecord(record)
  const now = Date.now()
  database
    .prepare(
      `INSERT INTO sticker_cache
        (file_unique_id, kind, pack_name, width, height, file_size, converter_version, file_path, time_created, time_updated)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(file_unique_id, kind) DO UPDATE SET
        pack_name = excluded.pack_name,
        width = excluded.width,
        height = excluded.height,
        file_size = excluded.file_size,
        converter_version = excluded.converter_version,
        file_path = excluded.file_path,
        time_updated = excluded.time_updated`,
    )
    .run(
      normalized.fileUniqueId,
      normalized.kind,
      normalized.packName,
      normalized.width,
      normalized.height,
      normalized.fileSize,
      normalized.converterVersion,
      normalized.filePath,
      now,
      now,
    )
}

function getCacheRecord(database, fileUniqueId, kind) {
  return database
    .prepare(
      `SELECT file_unique_id, kind, pack_name, width, height, file_size, converter_version, file_path
       FROM sticker_cache WHERE file_unique_id = ? AND kind = ?`,
    )
    .get(fileUniqueId, kind)
}

function listPackSummaries(packNames, stickers) {
  return packNames.sort().map((name) => {
    const packStickers = stickers.filter((sticker) => sticker.packName === name)
    return {
      name,
      stickerCount: packStickers.length,
      emojis: [...new Set(packStickers.map((sticker) => sticker.emoji).filter(Boolean))],
    }
  })
}

function listStickerCatalog(stickers) {
  return stickers.map((sticker) => ({
    packName: sticker.packName,
    emoji: sticker.emoji,
    description: sticker.description,
  }))
}

function findStickerForEmoji(stickers, emoji, { random = Math.random } = {}) {
  const matching = stickers.filter((sticker) => sticker.emoji === emoji)
  const candidates = matching.length > 0 ? matching : stickers
  if (candidates.length === 0) {
    return null
  }
  const index = Math.min(candidates.length - 1, Math.floor(random() * candidates.length))
  return candidates[index]
}

function findStickerForSelector(stickers, selector, { random = Math.random } = {}) {
  const normalizedSelector = normalizeSelector(selector)
  if (!normalizedSelector || normalizedSelector === "any") {
    return pickSticker(stickers, random)
  }

  const matchingEmoji = stickers.filter((sticker) => sticker.emoji === selector)
  if (matchingEmoji.length > 0) {
    return pickSticker(matchingEmoji, random)
  }

  const matchingDescription = stickers.filter((sticker) =>
    normalizeSelector(sticker.description).includes(normalizedSelector),
  )
  if (matchingDescription.length > 0) {
    return pickSticker(matchingDescription, random)
  }

  return pickSticker(stickers, random)
}

function pickSticker(stickers, random) {
  if (stickers.length === 0) {
    return null
  }
  const index = Math.min(stickers.length - 1, Math.floor(random() * stickers.length))
  return stickers[index]
}

function normalizeStickerList(stickers, packName) {
  return [...(stickers ?? [])].map((sticker) => normalizeSticker({ ...sticker, packName }))
}

function normalizeSticker(sticker) {
  const fileUniqueId = firstString(sticker?.fileUniqueId, sticker?.file_unique_id)
  const fileId = firstString(sticker?.fileId, sticker?.file_id)
  if (!fileUniqueId || !fileId) {
    throw new Error("Sticker metadata requires fileUniqueId and fileId")
  }
  return {
    fileUniqueId,
    fileId,
    packName: firstString(sticker?.packName, sticker?.set_name) ?? null,
    emoji: firstString(sticker?.emoji) ?? null,
    description: normalizeDescription(sticker?.description),
    kind: firstString(sticker?.kind) ?? "static",
    width: numberOrNull(sticker?.width),
    height: numberOrNull(sticker?.height),
    fileSize: numberOrNull(sticker?.fileSize, sticker?.file_size),
  }
}

function normalizeCacheRecord(record) {
  const fileUniqueId = firstString(record?.fileUniqueId, record?.file_unique_id)
  const kind = firstString(record?.kind)
  const filePath = firstString(record?.filePath, record?.file_path)
  if (!fileUniqueId || !kind || !filePath) {
    throw new Error("Sticker cache records require fileUniqueId, kind, and filePath")
  }
  return {
    fileUniqueId,
    kind,
    packName: firstString(record?.packName, record?.pack_name) ?? null,
    width: numberOrNull(record?.width),
    height: numberOrNull(record?.height),
    fileSize: numberOrNull(record?.fileSize, record?.file_size),
    converterVersion: firstString(record?.converterVersion, record?.converter_version) ?? "1",
    filePath,
  }
}

function rowToSticker(row) {
  if (!row) {
    return null
  }
  return {
    fileUniqueId: row.file_unique_id,
    fileId: row.file_id,
    packName: row.pack_name ?? null,
    emoji: row.emoji ?? null,
    description: row.description ?? null,
    kind: row.kind,
    width: row.width ?? null,
    height: row.height ?? null,
    fileSize: row.file_size ?? null,
  }
}

function rowToCacheRecord(row) {
  if (!row) {
    return null
  }
  return {
    fileUniqueId: row.file_unique_id,
    kind: row.kind,
    packName: row.pack_name ?? null,
    width: row.width ?? null,
    height: row.height ?? null,
    fileSize: row.file_size ?? null,
    converterVersion: row.converter_version,
    filePath: row.file_path,
  }
}

function preserveDescription(sticker, previousSticker) {
  return {
    ...sticker,
    description: normalizeDescription(sticker.description) ?? previousSticker?.description ?? null,
  }
}

function normalizeDescription(description) {
  const value = firstString(description)
  if (!value) {
    return null
  }
  return value.replace(/\s+/gu, " ").slice(0, 160)
}

function normalizeSelector(selector) {
  return String(selector ?? "")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("en-US")
}

function normalizePackName(name) {
  const value = firstString(name)
  if (!value) {
    throw new Error("Sticker pack name is required")
  }
  return value
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim()
    }
  }
  return null
}

function numberOrNull(...values) {
  for (const value of values) {
    const number = Number(value)
    if (Number.isFinite(number)) {
      return number
    }
  }
  return null
}

function cacheKey(fileUniqueId, kind) {
  return `${fileUniqueId}:${kind}`
}
