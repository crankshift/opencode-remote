import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { migrateConfig } from "./configMigration.js"
import { GatewayConfigError, getConfigPaths, loadConfigFromObject } from "./loadConfig.js"

export async function setConfigValue({
  key,
  value,
  global = false,
  cwd = process.cwd(),
  homeDir,
} = {}) {
  const paths = getConfigPaths({ cwd, homeDir })
  const configPath = global
    ? paths.globalConfigPath
    : await findExistingConfigPath([paths.localConfigPath, paths.globalConfigPath])
  return setConfigValuesAtPath({
    configPath,
    cwd,
    values: { [key]: parseConfigValue(value) },
  })
}

export async function setConfigValuesAtPath({ configPath, values, cwd = process.cwd() } = {}) {
  const rawConfig = migrateConfig(await readJsonConfig(configPath))
  let nextConfig = rawConfig
  for (const [key, value] of Object.entries(values ?? {})) {
    nextConfig = setNestedValue(nextConfig, key, value)
  }
  const config = loadConfigFromObject(nextConfig, { configPath, cwd })

  await mkdir(dirname(configPath), { recursive: true })
  await writeFile(configPath, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8")

  return { configPath, config }
}

async function findExistingConfigPath(paths) {
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
  return paths[0]
}

async function readJsonConfig(configPath) {
  let raw
  try {
    raw = await readFile(configPath, "utf8")
  } catch (error) {
    throw new GatewayConfigError(`Could not read config file at ${configPath}.`, {
      code: error?.code === "ENOENT" ? "missing_config" : "read_error",
      configPath,
    })
  }

  try {
    return JSON.parse(raw)
  } catch {
    throw new GatewayConfigError(`Could not parse config file at ${configPath} as JSON.`, {
      code: "invalid_json",
      configPath,
    })
  }
}

function setNestedValue(config, key, value) {
  const parts = String(key ?? "")
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length < 2) {
    throw new GatewayConfigError("Config updates require a nested config key like voice.enabled.", {
      code: "invalid_key",
    })
  }

  const next = structuredClone(config)
  let target = next
  for (const part of parts.slice(0, -1)) {
    if (!target[part] || typeof target[part] !== "object" || Array.isArray(target[part])) {
      target[part] = {}
    }
    target = target[part]
  }
  target[parts.at(-1)] = value
  return next
}

function parseConfigValue(value) {
  const text = String(value ?? "")
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}
