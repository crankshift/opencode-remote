import { spawn } from "node:child_process"
import { mkdir, open, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"

const PID_FILE_NAME = "gateway.pid"
const LOG_FILE_NAME = "gateway.log"

export function getGatewayLifecyclePaths(config) {
  const baseDir = dirname(config.configPath ?? config.settingsPath)

  return {
    pidPath: join(baseDir, PID_FILE_NAME),
    logPath: join(baseDir, LOG_FILE_NAME),
  }
}

export async function getGatewayBackgroundStatus({ config, processLike = process } = {}) {
  const paths = getGatewayLifecyclePaths(config)
  const pid = await readPid(paths.pidPath)

  if (pid.status === "missing") {
    return { status: "stopped", ...paths }
  }

  if (pid.status === "invalid") {
    return { status: "stale", ...paths }
  }

  if (isProcessRunning(pid.value, processLike)) {
    return { status: "running", pid: pid.value, ...paths }
  }

  return { status: "stale", pid: pid.value, ...paths }
}

export async function startGatewayInBackground({
  config,
  processLike = process,
  spawnProcess = spawn,
} = {}) {
  const paths = getGatewayLifecyclePaths(config)
  const status = await getGatewayBackgroundStatus({ config, processLike })

  if (status.status === "running") {
    return { status: "already_running", pid: status.pid, ...paths }
  }

  if (status.status === "stale") {
    await rm(paths.pidPath, { force: true })
  }

  await mkdir(dirname(paths.pidPath), { recursive: true })
  const log = await open(paths.logPath, "a")

  try {
    const child = spawnProcess(processLike.execPath, [processLike.argv[1], "run"], {
      cwd: processLike.cwd(),
      detached: true,
      env: processLike.env,
      stdio: ["ignore", log.fd, log.fd],
    })

    if (!Number.isInteger(child.pid) || child.pid <= 0) {
      throw new Error("Could not determine background gateway process ID")
    }

    if (typeof child.unref === "function") {
      child.unref()
    }

    await writeFile(paths.pidPath, `${child.pid}\n`, "utf8")
    return { status: "started", pid: child.pid, ...paths }
  } finally {
    await log.close()
  }
}

export async function stopGatewayInBackground({ config, processLike = process } = {}) {
  const paths = getGatewayLifecyclePaths(config)
  const status = await getGatewayBackgroundStatus({ config, processLike })

  if (status.status === "stopped") {
    return { status: "not_running", ...paths }
  }

  if (status.status === "stale") {
    await rm(paths.pidPath, { force: true })
    return { status: "stale", pid: status.pid, ...paths }
  }

  try {
    processLike.kill(status.pid, "SIGTERM")
  } catch (error) {
    if (error?.code !== "ESRCH") {
      throw error
    }
  }

  await rm(paths.pidPath, { force: true })
  return { status: "stopped", pid: status.pid, ...paths }
}

async function readPid(pidPath) {
  let raw
  try {
    raw = await readFile(pidPath, "utf8")
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { status: "missing" }
    }
    throw error
  }

  const trimmed = raw.trim()
  const value = Number(trimmed)
  if (!trimmed || !Number.isInteger(value) || value <= 0) {
    return { status: "invalid" }
  }

  return { status: "valid", value }
}

function isProcessRunning(pid, processLike) {
  try {
    processLike.kill(pid, 0)
    return true
  } catch (error) {
    return error?.code === "EPERM"
  }
}
