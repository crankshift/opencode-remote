import "dotenv/config"
import { z } from "zod"

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1, "TELEGRAM_BOT_TOKEN is required"),
  TELEGRAM_ALLOWED_USER_ID: z.coerce.number().int().positive(),
  OPENCODE_API_URL: z.string().url().default("http://localhost:4096"),
  OPENCODE_COMMAND: z.string().min(1).default("opencode"),
  OPENCODE_AUTO_START: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  OPENCODE_WORKDIR: z.string().optional(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  SETTINGS_PATH: z.string().min(1).default(".data/settings.json"),
})

export function loadConfigFromEnv(env = process.env) {
  const parsed = envSchema.parse(env)

  return {
    telegram: {
      botToken: parsed.TELEGRAM_BOT_TOKEN,
      allowedUserId: parsed.TELEGRAM_ALLOWED_USER_ID,
    },
    opencode: {
      apiUrl: parsed.OPENCODE_API_URL,
      command: parsed.OPENCODE_COMMAND,
      autoStart: parsed.OPENCODE_AUTO_START,
      workdir: parsed.OPENCODE_WORKDIR || process.cwd(),
    },
    logLevel: parsed.LOG_LEVEL,
    settingsPath: parsed.SETTINGS_PATH,
  }
}

export function loadConfig() {
  return loadConfigFromEnv(process.env)
}
