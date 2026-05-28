export const CURRENT_CONFIG_SCHEMA_VERSION = 2

export function migrateConfig(rawConfig) {
  if (!rawConfig || typeof rawConfig !== "object" || Array.isArray(rawConfig)) {
    return rawConfig
  }

  const version = rawConfig.schemaVersion ?? 1
  if (version === 1) {
    return migrateV1ToV2(rawConfig)
  }
  if (version === CURRENT_CONFIG_SCHEMA_VERSION) {
    return normalizeV2Shape(rawConfig)
  }
  return rawConfig
}

function migrateV1ToV2(rawConfig) {
  const next = structuredClone(rawConfig)
  next.schemaVersion = CURRENT_CONFIG_SCHEMA_VERSION
  next.telegram = normalizeTelegramAllowlists(next.telegram)
  return next
}

function normalizeV2Shape(rawConfig) {
  const next = structuredClone(rawConfig)
  next.telegram = normalizeTelegramAllowlists(next.telegram)
  return next
}

function normalizeTelegramAllowlists(telegram) {
  if (!telegram || typeof telegram !== "object" || Array.isArray(telegram)) {
    return telegram
  }

  const next = { ...telegram }
  if (!Array.isArray(next.allowedUserIds) && next.allowedUserId !== undefined) {
    next.allowedUserIds = [next.allowedUserId]
  }
  delete next.allowedUserId
  delete next.allowedBotIds
  return next
}
