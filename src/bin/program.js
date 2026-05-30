import { Command } from "commander"
import { loadConfig as defaultLoadConfig } from "../config/loadConfig.js"
import {
  createConfig as defaultCreateConfig,
  loadOrCreateConfig as defaultLoadOrCreateConfig,
} from "../config/setupConfig.js"
import { setConfigValue as defaultSetConfigValue } from "../config/writeConfig.js"
import { clearVoiceCache as defaultClearVoiceCache } from "../core/voice/cache.js"
import {
  getGatewayBackgroundStatus as defaultGetGatewayBackgroundStatus,
  startGatewayInBackground as defaultStartGatewayInBackground,
  stopGatewayInBackground as defaultStopGatewayInBackground,
} from "../runtime/background.js"
import { runGateway as defaultRunGateway } from "../runtime/bootstrap.js"
import {
  disableGatewayStartup as defaultDisableGatewayStartup,
  enableGatewayStartup as defaultEnableGatewayStartup,
  getGatewayStartupStatus as defaultGetGatewayStartupStatus,
} from "../runtime/startup.js"

export function createGatewayProgram({
  createConfig = defaultCreateConfig,
  loadConfig = defaultLoadConfig,
  loadOrCreateConfig = defaultLoadOrCreateConfig,
  runGateway = defaultRunGateway,
  startGatewayInBackground = defaultStartGatewayInBackground,
  stopGatewayInBackground = defaultStopGatewayInBackground,
  getGatewayBackgroundStatus = defaultGetGatewayBackgroundStatus,
  enableGatewayStartup = defaultEnableGatewayStartup,
  disableGatewayStartup = defaultDisableGatewayStartup,
  getGatewayStartupStatus = defaultGetGatewayStartupStatus,
  setConfigValue = defaultSetConfigValue,
  clearVoiceCache = defaultClearVoiceCache,
  output = process.stdout,
} = {}) {
  const program = new Command()
  const afterCreate = createStartupAfterConfigHook({ enableGatewayStartup, output })

  program.name("opencode-remote").description("OpenCode messaging gateway").version("0.10.0")

  program
    .command("setup")
    .description("Create or replace the gateway config")
    .action(async () => {
      const config = await createConfig({ afterCreate })
      output.write(`Config ready: ${config.configPath}\n`)
    })

  program
    .command("run")
    .description("Run the gateway in the foreground")
    .option("--state-suffix <suffix>", "Use a suffixed state database")
    .action(async (options) => {
      const config = await loadOrCreateConfig({ afterCreate })
      await runGateway(
        options.stateSuffix ? { config, stateSuffix: options.stateSuffix } : { config },
      )
    })

  program
    .command("start")
    .description("Run the gateway in the background")
    .action(async () => {
      const config = await loadOrCreateConfig({ afterCreate })
      const result = await startGatewayInBackground({ config })
      output.write(formatStartResult(result))
    })

  program
    .command("stop")
    .description("Stop the background gateway")
    .action(async () => {
      const config = await loadConfig()
      const result = await stopGatewayInBackground({ config })
      output.write(formatStopResult(result))
    })

  program
    .command("status")
    .description("Show background gateway status")
    .action(async () => {
      const config = await loadConfig()
      const result = await getGatewayBackgroundStatus({ config })
      output.write(formatStatusResult(result))
    })

  const config = program.command("config").description("Manage gateway config")

  config
    .command("set <key> <value>")
    .description("Set one config value")
    .option("-g, --global", "Update global config instead of local config")
    .action(async (key, value, options) => {
      const result = await setConfigValue({ key, value, global: Boolean(options.global) })
      output.write(`Updated ${key} in ${result.configPath}.\n`)
    })

  const cache = program.command("cache").description("Manage gateway cache")

  cache
    .command("clear")
    .description("Clear generated voice cache files")
    .action(async () => {
      const result = await clearVoiceCache()
      output.write(`Cleared voice cache: ${result.directory}\n`)
    })

  const startup = program.command("startup").description("Manage login startup")

  startup
    .command("enable")
    .description("Start the gateway when you log in")
    .action(async () => {
      const config = await loadConfig()
      const result = await enableGatewayStartup({ config })
      output.write(formatStartupEnableResult(result))
    })

  startup
    .command("disable")
    .description("Stop starting the gateway when you log in")
    .action(async () => {
      const config = await loadConfig()
      const result = await disableGatewayStartup({ config })
      output.write(formatStartupDisableResult(result))
    })

  startup
    .command("status")
    .description("Show login startup status")
    .action(async () => {
      const config = await loadConfig()
      const result = await getGatewayStartupStatus({ config })
      output.write(formatStartupStatusResult(result))
    })

  return program
}

function createStartupAfterConfigHook({ enableGatewayStartup, output }) {
  return async ({ config, startup }) => {
    if (startup?.enabled !== true) {
      return
    }

    const result = await enableGatewayStartup({ config })
    output.write(formatStartupEnableResult(result))
  }
}

function formatStartResult(result) {
  if (result.status === "already_running") {
    return `Gateway is already running (PID ${result.pid}). Logs: ${result.logPath}\n`
  }

  return `Gateway started in background (PID ${result.pid}). Logs: ${result.logPath}\n`
}

function formatStopResult(result) {
  if (result.status === "not_running") {
    return "Gateway is not running.\n"
  }

  if (result.status === "stale") {
    return "Gateway is not running; removed stale PID file.\n"
  }

  return `Gateway stopped (PID ${result.pid}).\n`
}

function formatStatusResult(result) {
  if (result.status === "running") {
    return `Gateway is running (PID ${result.pid}). Logs: ${result.logPath}\n`
  }

  if (result.status === "stale") {
    return "Gateway is not running; PID file is stale.\n"
  }

  return "Gateway is not running.\n"
}

function formatStartupEnableResult(result) {
  if (result.status === "unsupported") {
    return `Login startup is not supported on ${result.platform}.\n`
  }

  return `Login startup enabled for ${result.cwd}. Entry: ${formatStartupEntry(result)}\n`
}

function formatStartupDisableResult(result) {
  if (result.status === "unsupported") {
    return `Login startup is not supported on ${result.platform}.\n`
  }

  return `Login startup disabled. Entry: ${formatStartupEntry(result)}\n`
}

function formatStartupStatusResult(result) {
  if (result.status === "unsupported") {
    return `Login startup is not supported on ${result.platform}.\n`
  }

  if (result.status === "enabled") {
    return `Login startup is enabled for ${result.cwd}. Entry: ${formatStartupEntry(result)}\n`
  }

  if (result.status === "stale") {
    return `Login startup entry is stale for ${result.cwd}. Entry: ${formatStartupEntry(result)}\n`
  }

  return "Login startup is disabled.\n"
}

function formatStartupEntry(result) {
  return result.entryPath ?? result.entryName
}
