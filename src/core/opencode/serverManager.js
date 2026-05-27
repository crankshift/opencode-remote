import { setTimeout as delay } from "node:timers/promises"
import { execa } from "execa"

export async function defaultReachabilityCheck(apiUrl, { timeoutMs = 5000 } = {}) {
  try {
    const signal = createTimeoutSignal(timeoutMs)
    const response = await fetch(apiUrl, { method: "GET", ...(signal ? { signal } : {}) })
    return response.ok || response.status === 404
  } catch {
    return false
  }
}

export async function ensureOpenCodeServer({
  apiUrl,
  command,
  autoStart,
  workdir,
  isReachable = defaultReachabilityCheck,
  processFactory = execa,
  waitMs = 500,
  maxAttempts = 120,
  reachabilityTimeoutMs = 5000,
}) {
  if (await checkReachability(apiUrl, isReachable, reachabilityTimeoutMs)) {
    return { started: false, stop: async () => {} }
  }

  if (!autoStart) {
    throw new Error(`OpenCode server is not reachable at ${apiUrl}`)
  }

  const child = processFactory(command, buildServeArgs(apiUrl), {
    cwd: workdir,
    reject: false,
    stdio: "pipe",
  })

  const startupDeadline = Date.now() + waitMs * maxAttempts
  while (Date.now() < startupDeadline) {
    await delay(Math.min(waitMs, startupDeadline - Date.now()))
    const remainingMs = startupDeadline - Date.now()
    if (remainingMs <= 0) {
      break
    }

    if (
      await checkReachability(apiUrl, isReachable, Math.min(reachabilityTimeoutMs, remainingMs))
    ) {
      return {
        started: true,
        stop: async () => {
          if (typeof child.kill === "function") {
            child.kill("SIGTERM")
          }
        },
      }
    }
  }

  if (typeof child.kill === "function") {
    child.kill("SIGTERM")
  }
  throw new Error(`OpenCode server did not become reachable at ${apiUrl}`)
}

function buildServeArgs(apiUrl) {
  let parsed
  try {
    parsed = new URL(apiUrl)
  } catch {
    return ["serve"]
  }

  if (!parsed.port || !isLocalHostname(parsed.hostname)) {
    return ["serve"]
  }

  return ["serve", "--port", parsed.port]
}

function isLocalHostname(hostname) {
  return ["localhost", "127.0.0.1"].includes(hostname)
}

function checkReachability(apiUrl, isReachable, timeoutMs) {
  return Promise.race([isReachable(apiUrl, { timeoutMs }), delay(timeoutMs, false)])
}

function createTimeoutSignal(timeoutMs) {
  if (
    timeoutMs <= 0 ||
    typeof AbortSignal === "undefined" ||
    typeof AbortSignal.timeout !== "function"
  ) {
    return undefined
  }

  return AbortSignal.timeout(timeoutMs)
}
