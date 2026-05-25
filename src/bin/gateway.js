#!/usr/bin/env node
import { createGatewayProgram } from "./program.js"

try {
  await createGatewayProgram().parseAsync(process.argv)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
