import { Command } from "commander"
import { loadConfig as defaultLoadConfig } from "../config/loadConfig.js"
import {
  createConfig as defaultCreateConfig,
  loadOrCreateConfig as defaultLoadOrCreateConfig,
} from "../config/setupConfig.js"
import {
  getGatewayBackgroundStatus as defaultGetGatewayBackgroundStatus,
  startGatewayInBackground as defaultStartGatewayInBackground,
  stopGatewayInBackground as defaultStopGatewayInBackground,
} from "../runtime/background.js"
import { runGateway as defaultRunGateway } from "../runtime/bootstrap.js"

export function createGatewayProgram({
  createConfig = defaultCreateConfig,
  loadConfig = defaultLoadConfig,
  loadOrCreateConfig = defaultLoadOrCreateConfig,
  runGateway = defaultRunGateway,
  startGatewayInBackground = defaultStartGatewayInBackground,
  stopGatewayInBackground = defaultStopGatewayInBackground,
  getGatewayBackgroundStatus = defaultGetGatewayBackgroundStatus,
  output = process.stdout,
} = {}) {
  const program = new Command()

  program.name("opencode-remote").description("OpenCode messaging gateway").version("0.2.0")

  program
    .command("setup")
    .description("Create or replace the gateway config")
    .action(async () => {
      const config = await createConfig()
      output.write(`Config ready: ${config.configPath}\n`)
    })

  program
    .command("run")
    .description("Run the gateway in the foreground")
    .option("--state-suffix <suffix>", "Use a suffixed state database")
    .action(async (options) => {
      const config = await loadOrCreateConfig()
      await runGateway(
        options.stateSuffix ? { config, stateSuffix: options.stateSuffix } : { config },
      )
    })

  program
    .command("start")
    .description("Run the gateway in the background")
    .action(async () => {
      const config = await loadOrCreateConfig()
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

  return program
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
