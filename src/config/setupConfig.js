import { readFileSync } from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { stdin as defaultInput, stdout as defaultOutput } from "node:process"
import { emitKeypressEvents } from "node:readline"
import { createInterface } from "node:readline/promises"
import {
  checkFfmpeg as defaultCheckFfmpeg,
  detectFfmpegInstaller as defaultDetectFfmpegInstaller,
  installFfmpeg as defaultInstallFfmpeg,
} from "../core/voice/audioConverter.js"
import { getConfigPaths, loadConfig, loadConfigFromObject } from "./loadConfig.js"

const defaultPromptConfig = {
  progressVerbosity: "verbose",
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

  return createConfig({ cwd, homeDir, prompter })
}

export async function createConfig({
  cwd = process.cwd(),
  homeDir,
  prompter = promptForConfig,
} = {}) {
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

export async function promptForConfig(
  paths,
  {
    input = defaultInput,
    output = defaultOutput,
    checkFfmpeg = defaultCheckFfmpeg,
    detectFfmpegInstaller = defaultDetectFfmpegInstaller,
    installFfmpeg = defaultInstallFfmpeg,
  } = {},
) {
  output.write("Let's create OpenCode Remote config.\n")
  const rl = createInterface({ input, output })

  try {
    const scope = await askChoice(
      rl,
      "Create config where? local/global",
      ["local", "global"],
      "local",
      { input, output },
    )
    const currentConfig = loadCurrentConfigForScope(paths, scope)
    if (currentConfig) {
      output.write(
        `Current config found at ${currentConfig.configPath}. Press Enter with no value to keep current prompt values.\n`,
      )
    }

    const botToken = await askRequired(rl, "Telegram bot token", currentConfig?.telegram.botToken, {
      secret: true,
    })
    const allowedUserId = Number(
      await askInteger(rl, "Telegram allowed user ID", currentConfig?.telegram.allowedUserId),
    )
    const progressVerbosity = await askChoice(
      rl,
      "Progress verbosity",
      ["off", "new", "all", "verbose"],
      currentConfig?.progressVerbosity ?? defaultPromptConfig.progressVerbosity,
      { input, output },
    )
    const logLevel = await askChoice(
      rl,
      "Log level",
      ["fatal", "error", "warn", "info", "debug", "trace", "silent"],
      currentConfig?.logLevel ?? defaultPromptConfig.logLevel,
      { input, output },
    )
    const enableVoice = await askChoice(
      rl,
      "Enable voice mode now? no/yes",
      ["no", "yes"],
      currentConfig?.voice.enabled ? "yes" : "no",
      {
        input,
        output,
      },
    )
    const voice = await promptForVoiceConfig({
      rl,
      enableVoice,
      currentVoice: currentConfig?.voice.enabled ? currentConfig.voice : null,
      checkFfmpeg,
      detectFfmpegInstaller,
      installFfmpeg,
      input,
      output,
    })

    return {
      scope,
      config: {
        telegram: {
          botToken,
          allowedUserId,
        },
        progressVerbosity,
        ...(voice ? { voice } : {}),
        logLevel,
      },
    }
  } finally {
    rl.close()
  }
}

function loadCurrentConfigForScope(paths, scope) {
  const configPath = scope === "global" ? paths.globalConfigPath : paths.localConfigPath

  let raw
  try {
    raw = JSON.parse(readFileSync(configPath, "utf8"))
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null
    }
    throw error
  }

  return loadConfigFromObject(raw, { configPath })
}

async function promptForVoiceConfig({
  rl,
  enableVoice,
  currentVoice,
  checkFfmpeg,
  detectFfmpegInstaller,
  installFfmpeg,
  input,
  output,
}) {
  if (enableVoice !== "yes") {
    return null
  }

  const hasFfmpeg = await waitForFfmpeg({
    rl,
    checkFfmpeg,
    detectFfmpegInstaller,
    installFfmpeg,
    input,
    output,
  })
  if (!hasFfmpeg) {
    return null
  }

  const groqApiKey = await askRequired(rl, "Groq API key", currentVoice?.groqApiKey, {
    secret: true,
  })
  const voice = currentVoice?.voice
    ? await askRequired(rl, "Edge TTS voice", currentVoice.voice)
    : await askWithDefault(rl, "Edge TTS voice", "en-US-AndrewNeural")
  return {
    enabled: true,
    mode: "on",
    groqApiKey,
    voice,
  }
}

async function waitForFfmpeg({
  rl,
  checkFfmpeg,
  detectFfmpegInstaller,
  installFfmpeg,
  input,
  output,
}) {
  let offeredAutomaticInstall = false

  while (true) {
    const ffmpeg = await checkFfmpeg()
    if (ffmpeg.available) {
      return true
    }

    output.write(`${ffmpeg.message}\n`)

    if (!offeredAutomaticInstall) {
      offeredAutomaticInstall = true
      const installer = await detectFfmpegInstaller()
      if (installer) {
        const useInstaller = await askChoice(
          rl,
          `Install ffmpeg with ${installer.displayCommand}? no/yes`,
          ["no", "yes"],
          "yes",
          { input, output },
        )
        if (useInstaller === "yes") {
          output.write(`Running ${installer.displayCommand}...\n`)
          const result = await runWithReadlinePaused(rl, () => installFfmpeg(installer))
          if (!result.ok) {
            output.write("Could not install ffmpeg automatically.\n")
          }
          continue
        }
      } else {
        output.write("No supported automatic ffmpeg installer was found.\n")
      }
    }

    const retry = await askOptional(
      rl,
      "Install ffmpeg in another terminal, then press Enter to retry, or type skip",
    )
    if (retry.toLowerCase() === "skip") {
      output.write("Voice mode will remain disabled until ffmpeg is installed.\n")
      return false
    }
  }
}

async function runWithReadlinePaused(rl, action) {
  if (typeof rl.pause !== "function" || typeof rl.resume !== "function") {
    return action()
  }

  rl.pause()
  try {
    return await action()
  } finally {
    rl.resume()
  }
}

async function askRequired(rl, label, currentValue, options = {}) {
  while (true) {
    const value = (
      await rl.question(`${label}${formatCurrentHint(currentValue, options)}: `)
    ).trim()
    if (value) {
      return value
    }
    if (hasCurrentValue(currentValue)) {
      return currentValue
    }
    rl.output.write(`${label} is required.\n`)
  }
}

async function askInteger(rl, label, currentValue) {
  while (true) {
    const value = await askRequired(rl, label, currentValue)
    const parsed = Number(value)
    if (Number.isInteger(parsed) && parsed > 0) {
      return value
    }
    rl.output.write(`${label} must be a positive integer.\n`)
  }
}

async function askChoice(
  rl,
  label,
  choices,
  defaultValue,
  { input = defaultInput, output = defaultOutput } = {},
) {
  if (isInteractive(input, output)) {
    return askInteractiveChoice({ input, output, label, choices, defaultValue })
  }

  while (true) {
    const value = (
      await askWithDefault(rl, `${label} ${choices.join("/")}`, defaultValue)
    ).toLowerCase()
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

function formatCurrentHint(value, { secret = false } = {}) {
  if (!hasCurrentValue(value)) {
    return ""
  }
  return ` (current: ${secret ? "set" : value}; press Enter to keep)`
}

function hasCurrentValue(value) {
  return value !== undefined && value !== null && value !== ""
}

async function askOptional(rl, label) {
  return (await rl.question(`${label}: `)).trim()
}

function isInteractive(input, output) {
  return Boolean(input.isTTY && output.isTTY && typeof input.setRawMode === "function")
}

async function askInteractiveChoice({ input, output, label, choices, defaultValue }) {
  const defaultIndex = Math.max(choices.indexOf(defaultValue), 0)
  let selected = defaultIndex
  let rawWasEnabled = false
  let renderedLines = 0

  emitKeypressEvents(input)
  if (input.isRaw !== true) {
    input.setRawMode(true)
    rawWasEnabled = true
  }
  input.resume()

  function clearRenderedLines() {
    if (renderedLines === 0) {
      return
    }
    output.write(`\x1b[${renderedLines}F`)
    output.write("\x1b[J")
  }

  function render() {
    clearRenderedLines()
    const lines = [
      `${label}:`,
      ...choices.map((choice, index) => {
        const prefix = index === selected ? ">" : " "
        const line = `${prefix} ${choice}`
        return index === selected ? `\x1b[7m${line}\x1b[0m` : line
      }),
    ]
    output.write(`${lines.join("\n")}\n`)
    renderedLines = lines.length
  }

  render()
  return await new Promise((resolve, reject) => {
    function cleanup() {
      input.off("keypress", onKeypress)
      if (rawWasEnabled) {
        input.setRawMode(false)
      }
    }

    function onKeypress(_str, key = {}) {
      if (key.name === "up" || key.name === "left") {
        selected = (selected - 1 + choices.length) % choices.length
        render()
        return
      }
      if (key.name === "down" || key.name === "right") {
        selected = (selected + 1) % choices.length
        render()
        return
      }
      if (key.name === "return" || key.name === "enter") {
        cleanup()
        resolve(choices[selected])
        return
      }
      if (key.name === "c" && key.ctrl) {
        cleanup()
        reject(new Error("Setup cancelled"))
      }
    }

    input.on("keypress", onKeypress)
  })
}
