import { setTimeout as delay } from "node:timers/promises"
import { execa } from "execa"

export async function defaultReachabilityCheck(apiUrl) {
  try {
    const response = await fetch(apiUrl, { method: "GET" })
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
  maxAttempts = 30,
}) {
  if (await isReachable(apiUrl)) {
    return { started: false, stop: async () => {} }
  }

  if (!autoStart) {
    throw new Error(`OpenCode server is not reachable at ${apiUrl}`)
  }

  const child = processFactory(command, ["serve"], {
    cwd: workdir,
    reject: false,
    stdio: "pipe",
  })

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await delay(waitMs)
    if (await isReachable(apiUrl)) {
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
