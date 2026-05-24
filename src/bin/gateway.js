#!/usr/bin/env node
import { Command } from "commander"
import { runGateway } from "../runtime/bootstrap.js"

const program = new Command()

program.name("gateway").description("OpenCode messaging gateway").version("0.1.0")

program.command("run").description("Run the gateway in the foreground").action(async () => {
  try {
    await runGateway()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
})

await program.parseAsync(process.argv)
