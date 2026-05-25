import { mkdir, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { stdin as input, stdout as output } from "node:process"
import { createInterface } from "node:readline/promises"
import {
  getConfigPaths,
  loadConfig,
  loadConfigFromObject,
  SETTINGS_FILE_NAME,
} from "./loadConfig.js"

const defaultPromptConfig = {
  opencode: {
    apiUrl: "http://localhost:4096",
    command: "opencode",
    autoStart: true,
  },
  progressVerbosity: "all",
  logLevel: "info",
}

export async function loadOrCreateConfig({
  cwd = process.cwd(),
  homeDir,
  prompter = promptForConfig,
} = {}) {
  try {
    return await loadConfig({ cwd, homeDir })
  } catch (error) {
    if (error?.code !== "missing_config") {
      throw error
    }
  }

  return createConfig({ cwd, homeDir, prompter, skipExistingCheck: true })
}

export async function createConfig({
  cwd = process.cwd(),
  homeDir,
  prompter = promptForConfig,
  confirmOverwrite = confirmOverwriteConfig,
  skipExistingCheck = false,
} = {}) {
  if (!skipExistingCheck) {
    try {
      const existingConfig = await loadConfig({ cwd, homeDir })
      if (!(await confirmOverwrite(existingConfig.configPath))) {
        return existingConfig
      }
    } catch (error) {
      if (error?.code !== "missing_config") {
        throw error
      }
    }
  }

  const paths = getConfigPaths({ cwd, homeDir })
  const answers = await prompter(paths)
  return writePromptedConfig({ answers, paths, cwd })
}

async function writePromptedConfig({ answers, paths, cwd }) {
  const configPath = answers.scope === "global" ? paths.globalConfigPath : paths.localConfigPath
  const config = loadConfigFromObject(answers.config, { configPath, cwd })

  await mkdir(dirname(configPath), { recursive: true })
  await writeFile(configPath, `${JSON.stringify(answers.config, null, 2)}\n`, "utf8")

  return config
}

export async function confirmOverwriteConfig(configPath) {
  const rl = createInterface({ input, output })

  try {
    return askBoolean(rl, `Config already exists at ${configPath}. Replace it`, false)
  } finally {
    rl.close()
  }
}

export async function promptForConfig(paths) {
  output.write("No OpenCode Remote config found. Let's create one.\n")
  const rl = createInterface({ input, output })

  try {
    const scope = await askChoice(
      rl,
      "Create config where? local/global",
      ["local", "global"],
      "local",
    )
    const selectedConfigPath = scope === "global" ? paths.globalConfigPath : paths.localConfigPath
    const defaultSettingsPath = join(dirname(selectedConfigPath), SETTINGS_FILE_NAME)
    const botToken = await askRequired(rl, "Telegram bot token")
    const allowedUserId = Number(await askInteger(rl, "Telegram allowed user ID"))
    const apiUrl = await askWithDefault(rl, "OpenCode API URL", defaultPromptConfig.opencode.apiUrl)
    const command = await askWithDefault(
      rl,
      "OpenCode command",
      defaultPromptConfig.opencode.command,
    )
    const autoStart = await askBoolean(rl, "Auto-start OpenCode when unreachable", true)
    const workdir = await askWithDefault(rl, "OpenCode workdir", "")
    const progressVerbosity = await askChoice(
      rl,
      "Progress verbosity off/new/all/verbose",
      ["off", "new", "all", "verbose"],
      defaultPromptConfig.progressVerbosity,
    )
    const logLevel = await askChoice(
      rl,
      "Log level fatal/error/warn/info/debug/trace/silent",
      ["fatal", "error", "warn", "info", "debug", "trace", "silent"],
      defaultPromptConfig.logLevel,
    )
    const settingsPath = await askWithDefault(rl, "Settings path", defaultSettingsPath)

    return {
      scope,
      config: {
        telegram: {
          botToken,
          allowedUserId,
        },
        opencode: {
          apiUrl,
          command,
          autoStart,
          ...(workdir ? { workdir } : {}),
        },
        progressVerbosity,
        logLevel,
        ...(settingsPath === defaultSettingsPath ? {} : { settingsPath }),
      },
    }
  } finally {
    rl.close()
  }
}

async function askRequired(rl, label) {
  while (true) {
    const value = (await rl.question(`${label}: `)).trim()
    if (value) {
      return value
    }
    output.write(`${label} is required.\n`)
  }
}

async function askInteger(rl, label) {
  while (true) {
    const value = await askRequired(rl, label)
    const parsed = Number(value)
    if (Number.isInteger(parsed) && parsed > 0) {
      return value
    }
    output.write(`${label} must be a positive integer.\n`)
  }
}

async function askBoolean(rl, label, defaultValue) {
  const suffix = defaultValue ? "Y/n" : "y/N"
  while (true) {
    const value = (await rl.question(`${label} (${suffix}): `)).trim().toLowerCase()
    if (!value) {
      return defaultValue
    }
    if (["y", "yes", "true"].includes(value)) {
      return true
    }
    if (["n", "no", "false"].includes(value)) {
      return false
    }
    output.write("Answer yes or no.\n")
  }
}

async function askChoice(rl, label, choices, defaultValue) {
  while (true) {
    const value = (await askWithDefault(rl, label, defaultValue)).toLowerCase()
    if (choices.includes(value)) {
      return value
    }
    output.write(`Choose one of: ${choices.join(", ")}.\n`)
  }
}

async function askWithDefault(rl, label, defaultValue) {
  const value = (await rl.question(`${label} (${defaultValue}): `)).trim()
  return value || defaultValue
}
