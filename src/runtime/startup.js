import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)
const MACOS_LABEL_PREFIX = "com.crankshift.opencode-remote"
const LINUX_SERVICE_PREFIX = "opencode-remote"
const WINDOWS_TASK_PREFIX = "OpenCode Remote"

export async function enableGatewayStartup({
  config,
  cwd = process.cwd(),
  homeDir = homedir(),
  platform = process.platform,
  processLike = process,
  runCommand = defaultRunCommand,
} = {}) {
  const entry = getStartupEntry({ config, cwd, homeDir, platform })
  if (entry.status === "unsupported") {
    return entry
  }

  if (platform === "darwin") {
    await writeStartupFile(entry.entryPath, renderLaunchAgent({ entry, cwd, processLike }))
    return { status: "enabled", ...entry, cwd }
  }

  if (platform === "linux") {
    await writeStartupFile(entry.entryPath, renderSystemdService({ cwd, processLike }))
    await runCommand("systemctl", ["--user", "daemon-reload"])
    await runCommand("systemctl", ["--user", "enable", entry.entryName])
    return { status: "enabled", ...entry, cwd }
  }

  await runCommand("schtasks", [
    "/Create",
    "/F",
    "/SC",
    "ONLOGON",
    "/TN",
    entry.entryName,
    "/TR",
    renderWindowsTaskCommand({ cwd, processLike }),
  ])
  return { status: "enabled", ...entry, cwd }
}

export async function disableGatewayStartup({
  config,
  cwd = process.cwd(),
  homeDir = homedir(),
  platform = process.platform,
  runCommand = defaultRunCommand,
} = {}) {
  const entry = getStartupEntry({ config, cwd, homeDir, platform })
  if (entry.status === "unsupported") {
    return entry
  }

  if (platform === "linux") {
    if (!(await fileExists(entry.entryPath))) {
      return { status: "disabled", ...entry, cwd }
    }
    await runCommand("systemctl", ["--user", "disable", entry.entryName])
    await rm(entry.entryPath, { force: true })
    await runCommand("systemctl", ["--user", "daemon-reload"])
    return { status: "disabled", ...entry, cwd }
  }

  if (platform === "win32") {
    if (!(await windowsTaskExists(entry, runCommand))) {
      return { status: "disabled", ...entry, cwd }
    }
    await runCommand("schtasks", ["/Delete", "/F", "/TN", entry.entryName])
    return { status: "disabled", ...entry, cwd }
  }

  await rm(entry.entryPath, { force: true })
  return { status: "disabled", ...entry, cwd }
}

export async function getGatewayStartupStatus({
  config,
  cwd = process.cwd(),
  homeDir = homedir(),
  platform = process.platform,
  runCommand = defaultRunCommand,
} = {}) {
  const entry = getStartupEntry({ config, cwd, homeDir, platform })
  if (entry.status === "unsupported") {
    return entry
  }

  if (platform === "win32") {
    try {
      await runCommand("schtasks", ["/Query", "/TN", entry.entryName])
      return { status: "enabled", ...entry, cwd }
    } catch (_error) {
      return { status: "disabled", ...entry, cwd }
    }
  }

  let content
  try {
    content = await readFile(entry.entryPath, "utf8")
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { status: "disabled", ...entry, cwd }
    }
    throw error
  }

  if (!content.includes(cwd)) {
    return { status: "stale", ...entry, cwd }
  }

  return { status: "enabled", ...entry, cwd }
}

function getStartupEntry({ config, cwd, homeDir, platform }) {
  const id = createStartupId({ config, cwd })

  if (platform === "darwin") {
    const entryName = `${MACOS_LABEL_PREFIX}.${id}`
    return {
      platform,
      entryName,
      entryPath: join(homeDir, "Library", "LaunchAgents", `${entryName}.plist`),
    }
  }

  if (platform === "linux") {
    const entryName = `${LINUX_SERVICE_PREFIX}-${id}.service`
    return {
      platform,
      entryName,
      entryPath: join(homeDir, ".config", "systemd", "user", entryName),
    }
  }

  if (platform === "win32") {
    return {
      platform,
      entryName: `${WINDOWS_TASK_PREFIX} ${id}`,
      entryPath: null,
    }
  }

  return { status: "unsupported", platform }
}

function createStartupId({ config, cwd }) {
  return createHash("sha256")
    .update(`${config?.configPath ?? ""}\n${cwd}`)
    .digest("hex")
    .slice(0, 12)
}

async function writeStartupFile(filePath, content) {
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, content, "utf8")
}

async function fileExists(filePath) {
  try {
    await access(filePath)
    return true
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false
    }
    throw error
  }
}

async function windowsTaskExists(entry, runCommand) {
  try {
    await runCommand("schtasks", ["/Query", "/TN", entry.entryName])
    return true
  } catch (_error) {
    return false
  }
}

function renderLaunchAgent({ entry, cwd, processLike }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${escapeXml(entry.entryName)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${escapeXml(processLike.execPath)}</string>
    <string>${escapeXml(processLike.argv[1])}</string>
    <string>start</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${escapeXml(cwd)}</string>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>
`
}

function renderSystemdService({ cwd, processLike }) {
  return `[Unit]
Description=OpenCode Remote gateway

[Service]
Type=oneshot
WorkingDirectory=${cwd}
ExecStart=${quoteSystemdArg(processLike.execPath)} ${quoteSystemdArg(processLike.argv[1])} start

[Install]
WantedBy=default.target
`
}

function quoteSystemdArg(value) {
  const text = String(value)
  if (!/[\s"\\]/.test(text)) {
    return text
  }
  return `"${text.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`
}

function renderWindowsTaskCommand({ cwd, processLike }) {
  return `cmd /d /s /c "cd /d "${cwd}" && "${processLike.execPath}" "${processLike.argv[1]}" start"`
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;")
}

async function defaultRunCommand(command, args) {
  await execFileAsync(command, args)
}
