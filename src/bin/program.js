import { Command } from "commander"
import { loadOrCreateConfig as defaultLoadOrCreateConfig } from "../config/setupConfig.js"
import { runGateway as defaultRunGateway } from "../runtime/bootstrap.js"

export function createGatewayProgram({
  loadOrCreateConfig = defaultLoadOrCreateConfig,
  runGateway = defaultRunGateway,
} = {}) {
  const program = new Command()

  program.name("gateway").description("OpenCode messaging gateway").version("0.1.0")

  program
    .command("run")
    .description("Run the gateway in the foreground")
    .action(async () => {
      const config = await loadOrCreateConfig()
      await runGateway({ config })
    })

  return program
}
