import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { z } from "zod"
import { CURRENT_CONFIG_SCHEMA_VERSION, migrateConfig } from "./configMigration.js"

export const CONFIG_DIR_NAME = ".opencode-remote"
export const CONFIG_FILE_NAME = "config.json"
export const SETTINGS_FILE_NAME = "settings.json"

const progressVerbositySchema = z.enum(["off", "new", "all", "verbose"])
const voiceModeSchema = z.enum(["off", "on", "all"])
const logLevelSchema = z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
const positiveTelegramIdSchema = z.coerce
  .number()
  .int()
  .positive("Telegram ID must be a positive integer")
const telegramChatIdSchema = z.coerce.number().int("Telegram chat ID must be an integer")

const telegramConfigSchema = z
  .object({
    botToken: z.string().min(1, "Telegram bot token is required"),
    allowedUserIds: z.array(positiveTelegramIdSchema).default([]),
    allowedChatIds: z.array(telegramChatIdSchema).default([]),
  })
  .refine((telegram) => telegram.allowedUserIds.length > 0 || telegram.allowedChatIds.length > 0, {
    message: "Configure at least one Telegram allowed user ID or allowed chat ID",
    path: ["allowedChatIds"],
  })

const defaultVoiceConfig = {
  enabled: false,
  mode: "on",
  voice: "en-US-AndrewNeural",
  groqApiKey: null,
  sttModel: "whisper-large-v3-turbo",
}

const configSchema = z.object({
  schemaVersion: z.literal(CURRENT_CONFIG_SCHEMA_VERSION).default(CURRENT_CONFIG_SCHEMA_VERSION),
  telegram: telegramConfigSchema,
  opencode: z
    .object({
      apiUrl: z.string().url().default("http://localhost:4096"),
      command: z.string().min(1).default("opencode"),
      autoStart: z.boolean().default(true),
      workdir: z.string().min(1).nullable().optional(),
    })
    .default({}),
  progressVerbosity: progressVerbositySchema.default("verbose"),
  voice: z
    .object({
      enabled: z.boolean().default(false),
      mode: voiceModeSchema.default("on"),
      voice: z.string().min(1).default("en-US-AndrewNeural"),
      groqApiKey: z.string().min(1).nullable().default(null),
      sttModel: z.string().min(1).default("whisper-large-v3-turbo"),
    })
    .default(defaultVoiceConfig),
  logLevel: logLevelSchema.default("info"),
  settingsPath: z.string().min(1).optional(),
})

const defaultOpencodeConfig = {
  apiUrl: "http://localhost:4096",
  command: "opencode",
  autoStart: true,
}

export class GatewayConfigError extends Error {
  constructor(message, { code, configPath } = {}) {
    super(message)
    this.name = "GatewayConfigError"
    this.code = code
    this.configPath = configPath
  }
}

export function getConfigPaths({ cwd = process.cwd(), homeDir = homedir() } = {}) {
  return {
    localConfigPath: join(cwd, CONFIG_DIR_NAME, CONFIG_FILE_NAME),
    globalConfigPath: join(homeDir, CONFIG_DIR_NAME, CONFIG_FILE_NAME),
  }
}

export async function loadConfig({ cwd = process.cwd(), homeDir = homedir() } = {}) {
  const { localConfigPath, globalConfigPath } = getConfigPaths({ cwd, homeDir })
  const configPath = await findConfigPath([localConfigPath, globalConfigPath])

  if (!configPath) {
    throw new GatewayConfigError(
      `No OpenCode Remote config found. Expected ${localConfigPath} or ${globalConfigPath}.`,
      { code: "missing_config" },
    )
  }

  let raw
  try {
    raw = await readFile(configPath, "utf8")
  } catch {
    throw new GatewayConfigError(`Could not read config file at ${configPath}.`, {
      code: "read_error",
      configPath,
    })
  }

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new GatewayConfigError(`Could not parse config file at ${configPath} as JSON.`, {
      code: "invalid_json",
      configPath,
    })
  }

  return loadConfigFromObject(parsed, { configPath, cwd })
}

export function loadConfigFromObject(rawConfig, { configPath, cwd = process.cwd() } = {}) {
  const parsed = configSchema.safeParse(migrateConfig(rawConfig))

  if (!parsed.success) {
    throw new GatewayConfigError(
      `Invalid config${configPath ? ` at ${configPath}` : ""}: ${formatZodIssues(parsed.error)}`,
      { code: "invalid_config", configPath },
    )
  }

  const configDirectory = configPath ? dirname(configPath) : join(cwd, CONFIG_DIR_NAME)

  return {
    schemaVersion: parsed.data.schemaVersion,
    configPath,
    telegram: {
      botToken: parsed.data.telegram.botToken,
      allowedUserIds: parsed.data.telegram.allowedUserIds,
      allowedChatIds: parsed.data.telegram.allowedChatIds,
    },
    opencode: {
      apiUrl: parsed.data.opencode.apiUrl ?? defaultOpencodeConfig.apiUrl,
      command: parsed.data.opencode.command ?? defaultOpencodeConfig.command,
      autoStart: parsed.data.opencode.autoStart ?? defaultOpencodeConfig.autoStart,
      workdir: parsed.data.opencode.workdir || cwd,
    },
    progressVerbosity: parsed.data.progressVerbosity,
    voice: {
      enabled: parsed.data.voice.enabled,
      mode: parsed.data.voice.mode,
      voice: parsed.data.voice.voice,
      groqApiKey: parsed.data.voice.groqApiKey,
      sttModel: parsed.data.voice.sttModel,
    },
    logLevel: parsed.data.logLevel,
    settingsPath: parsed.data.settingsPath || join(configDirectory, SETTINGS_FILE_NAME),
  }
}

async function findConfigPath(paths) {
  for (const configPath of paths) {
    try {
      await readFile(configPath, "utf8")
      return configPath
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw new GatewayConfigError(`Could not read config file at ${configPath}.`, {
          code: "read_error",
          configPath,
        })
      }
    }
  }
  return null
}

function formatZodIssues(error) {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "config"}: ${issue.message}`)
    .join("; ")
}
