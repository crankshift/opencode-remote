import { execFile as execFileCallback } from "node:child_process"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { promisify } from "node:util"

const execFile = promisify(execFileCallback)

const packageJson = JSON.parse(await readFile("package.json", "utf8"))
const readme = await readFile("README.md", "utf8")

assertEqual(packageJson.bin?.gateway, "dist/bin/gateway.mjs", "gateway bin points at dist")
assertEqual(
  packageJson.bin?.["opencode-remote"],
  "dist/bin/gateway.mjs",
  "opencode-remote bin points at dist",
)
assertEqual(
  packageJson.main,
  "./dist/index.mjs",
  "package main points at side-effect-free dist entry",
)
assertEqual(
  packageJson.exports?.["."],
  "./dist/index.mjs",
  "package export points at side-effect-free dist entry",
)

const packageEntry = await import(pathToFileURL(join(process.cwd(), "dist/index.mjs")))
assert(
  typeof packageEntry.createGatewayProgram === "function",
  "package entry exports createGatewayProgram",
)
assert(typeof packageEntry.runGateway === "function", "package entry exports runGateway")

const relativeReadmeLinks = [...readme.matchAll(/(?<!!\[)\[[^\]\n]+\]\(([^)]+)\)/g)]
  .map((match) => match[1])
  .filter((href) => !/^(https?:|mailto:|#)/.test(href))
assert(
  relativeReadmeLinks.length === 0,
  `README links should work from npm package pages: ${relativeReadmeLinks.join(", ")}`,
)

const gatewayBin = await readFile("dist/bin/gateway.mjs", "utf8")
assert(
  gatewayBin.startsWith("#!/usr/bin/env node"),
  "dist/bin/gateway.mjs preserves the Node.js shebang",
)

const help = await execFile(process.execPath, ["dist/bin/gateway.mjs", "--help"])
assert(help.stdout.includes("OpenCode messaging gateway"), "dist CLI help renders")

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm"
const pack = await execFile(npmCommand, ["pack", "--dry-run", "--json", "--ignore-scripts"])
const packed = JSON.parse(pack.stdout)[0].files.map((file) => file.path)

for (const required of [
  "dist/index.mjs",
  "dist/bin/gateway.mjs",
  "package.json",
  "README.md",
  "LICENSE",
]) {
  assert(packed.includes(required), `package includes ${required}`)
}

for (const forbidden of ["src/bin/gateway.js", "tests/config/loadConfig.test.js", ".env.example"]) {
  assert(!packed.includes(forbidden), `package excludes ${forbidden}`)
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function assertEqual(actual, expected, message) {
  assert(actual === expected, `${message}: expected ${expected}, got ${actual}`)
}
