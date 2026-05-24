# Text-First Gateway MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local-first Telegram gateway that starts or connects to OpenCode, accepts text prompts from one authorized Telegram user, manages sessions, and replies with safe chunked text.

**Architecture:** Keep Telegram transport, OpenCode integration, runtime process management, formatting, and persisted gateway state in separate modules. Telegram uses grammY long polling; core services are messenger-neutral and can later support webhooks or other messengers without rewriting OpenCode/session logic.

**Tech Stack:** Node.js 24 LTS recommended with `engines.node >=22`, pnpm, JavaScript ESM, grammY, `@opencode-ai/sdk`, commander, execa, pino, zod, dotenv, Biome, Vitest.

---

## File Structure

- Create: `.gitignore` — ignore secrets, generated data, dependencies, coverage, logs, and temp files.
- Create: `.env.example` — document v1 environment variables without secrets.
- Create: `package.json` — pnpm scripts, runtime dependencies, dev dependencies, `bin` entry, Node engines.
- Create: `biome.json` — lint and formatting configuration.
- Create: `vitest.config.js` — Node test environment.
- Create: `src/bin/gateway.js` — executable CLI entry.
- Create: `src/runtime/bootstrap.js` — runtime wiring, startup, shutdown.
- Create: `src/config/loadConfig.js` — dotenv loading, zod validation, normalized config object.
- Create: `src/utils/logger.js` — pino logger factory.
- Create: `src/core/commands/commands.js` — centralized command definitions and help text.
- Create: `src/core/formatting/chunkText.js` — safe response chunking.
- Create: `src/core/session/settingsStore.js` — JSON settings persistence.
- Create: `src/core/opencode/serverManager.js` — reachability check and owned `opencode serve` child lifecycle.
- Create: `src/core/opencode/client.js` — OpenCode SDK wrapper and safe errors.
- Create: `src/core/gateway/controller.js` — messenger-neutral orchestration for status, sessions, prompts, and stop.
- Create: `src/adapters/telegram/auth.js` — Telegram allowlist checks.
- Create: `src/adapters/telegram/bot.js` — grammY bot construction, commands, callbacks, polling startup.
- Create: `tests/config/loadConfig.test.js` — config validation tests.
- Create: `tests/core/commands.test.js` — command/help tests.
- Create: `tests/core/chunkText.test.js` — formatting tests.
- Create: `tests/core/settingsStore.test.js` — persistence tests.
- Create: `tests/core/serverManager.test.js` — OpenCode process manager tests.
- Create: `tests/core/controller.test.js` — gateway controller tests.
- Create: `tests/adapters/telegramAuth.test.js` — auth tests.

## Task 1: Project Scaffold

**Files:**
- Create: `.gitignore`
- Create: `.env.example`
- Create: `package.json`
- Create: `biome.json`
- Create: `vitest.config.js`

- [ ] **Step 1: Write project metadata and scripts**

Create `package.json` with this content:

```json
{
  "name": "opencode-gateway",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "bin": {
    "opencode-gateway": "src/bin/gateway.js",
    "gateway": "src/bin/gateway.js"
  },
  "engines": {
    "node": ">=22"
  },
  "packageManager": "pnpm@10.11.0",
  "scripts": {
    "start": "node src/bin/gateway.js run",
    "dev": "node --watch src/bin/gateway.js run",
    "lint": "biome check .",
    "format": "biome format --write .",
    "test": "vitest run",
    "check": "pnpm run lint && pnpm test"
  },
  "dependencies": {
    "@opencode-ai/sdk": "latest",
    "commander": "latest",
    "dotenv": "latest",
    "execa": "latest",
    "grammy": "latest",
    "pino": "latest",
    "zod": "latest"
  },
  "devDependencies": {
    "@biomejs/biome": "latest",
    "vitest": "latest"
  }
}
```

- [ ] **Step 2: Add ignore rules**

Create `.gitignore`:

```gitignore
.DS_Store
.env
.env.*
!.env.example
.data/
coverage/
dist/
logs/
node_modules/
*.log
*.pid
*.tmp
*.ogg
*.opus
*.mp3
```

- [ ] **Step 3: Document environment variables**

Create `.env.example`:

```dotenv
TELEGRAM_BOT_TOKEN=
TELEGRAM_ALLOWED_USER_ID=
OPENCODE_API_URL=http://localhost:4096
OPENCODE_COMMAND=opencode
OPENCODE_AUTO_START=true
OPENCODE_WORKDIR=
LOG_LEVEL=info
SETTINGS_PATH=.data/settings.json
```

- [ ] **Step 4: Configure Biome and Vitest**

Create `biome.json`:

```json
{
  "$schema": "https://biomejs.dev/schemas/2.0.0/schema.json",
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true
    }
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "double",
      "semicolons": "asNeeded"
    }
  }
}
```

Create `vitest.config.js`:

```js
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.js"],
    restoreMocks: true,
  },
})
```

- [ ] **Step 5: Install dependencies**

Run: `pnpm install`

Expected: dependencies install and `pnpm-lock.yaml` is created.

- [ ] **Step 6: Commit scaffold**

Run: `git add .gitignore .env.example package.json biome.json vitest.config.js pnpm-lock.yaml && git commit -m "chore: scaffold node gateway project"`

## Task 2: Config Validation

**Files:**
- Create: `tests/config/loadConfig.test.js`
- Create: `src/config/loadConfig.js`

- [ ] **Step 1: Write failing config tests**

Create `tests/config/loadConfig.test.js`:

```js
import { describe, expect, test } from "vitest"
import { loadConfigFromEnv } from "../../src/config/loadConfig.js"

describe("loadConfigFromEnv", () => {
  test("requires Telegram token and allowed user ID", () => {
    expect(() => loadConfigFromEnv({})).toThrow(/TELEGRAM_BOT_TOKEN/)
  })

  test("parses defaults and numeric Telegram user ID", () => {
    const config = loadConfigFromEnv({
      TELEGRAM_BOT_TOKEN: "token",
      TELEGRAM_ALLOWED_USER_ID: "12345",
    })

    expect(config.telegram.botToken).toBe("token")
    expect(config.telegram.allowedUserId).toBe(12345)
    expect(config.opencode.apiUrl).toBe("http://localhost:4096")
    expect(config.opencode.autoStart).toBe(true)
    expect(config.settingsPath).toBe(".data/settings.json")
  })

  test("accepts false boolean for OpenCode auto-start", () => {
    const config = loadConfigFromEnv({
      TELEGRAM_BOT_TOKEN: "token",
      TELEGRAM_ALLOWED_USER_ID: "12345",
      OPENCODE_AUTO_START: "false",
    })

    expect(config.opencode.autoStart).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify RED**

Run: `pnpm vitest run tests/config/loadConfig.test.js`

Expected: FAIL because `src/config/loadConfig.js` does not exist.

- [ ] **Step 3: Implement config loader**

Create `src/config/loadConfig.js`:

```js
import "dotenv/config"
import { z } from "zod"

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1, "TELEGRAM_BOT_TOKEN is required"),
  TELEGRAM_ALLOWED_USER_ID: z.coerce.number().int().positive(),
  OPENCODE_API_URL: z.string().url().default("http://localhost:4096"),
  OPENCODE_COMMAND: z.string().min(1).default("opencode"),
  OPENCODE_AUTO_START: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  OPENCODE_WORKDIR: z.string().optional(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  SETTINGS_PATH: z.string().min(1).default(".data/settings.json"),
})

export function loadConfigFromEnv(env = process.env) {
  const parsed = envSchema.parse(env)

  return {
    telegram: {
      botToken: parsed.TELEGRAM_BOT_TOKEN,
      allowedUserId: parsed.TELEGRAM_ALLOWED_USER_ID,
    },
    opencode: {
      apiUrl: parsed.OPENCODE_API_URL,
      command: parsed.OPENCODE_COMMAND,
      autoStart: parsed.OPENCODE_AUTO_START,
      workdir: parsed.OPENCODE_WORKDIR || process.cwd(),
    },
    logLevel: parsed.LOG_LEVEL,
    settingsPath: parsed.SETTINGS_PATH,
  }
}

export function loadConfig() {
  return loadConfigFromEnv(process.env)
}
```

- [ ] **Step 4: Run test to verify GREEN**

Run: `pnpm vitest run tests/config/loadConfig.test.js`

Expected: PASS.

- [ ] **Step 5: Commit config module**

Run: `git add src/config/loadConfig.js tests/config/loadConfig.test.js && git commit -m "feat: add config validation"`

## Task 3: Commands And Formatting

**Files:**
- Create: `tests/core/commands.test.js`
- Create: `tests/core/chunkText.test.js`
- Create: `src/core/commands/commands.js`
- Create: `src/core/formatting/chunkText.js`

- [ ] **Step 1: Write failing tests**

Create `tests/core/commands.test.js`:

```js
import { describe, expect, test } from "vitest"
import { botCommands, renderHelpText } from "../../src/core/commands/commands.js"

describe("commands", () => {
  test("defines the v1 command surface", () => {
    expect(botCommands.map((command) => command.command)).toEqual([
      "status",
      "new",
      "sessions",
      "stop",
      "help",
    ])
  })

  test("renders help from centralized command definitions", () => {
    const help = renderHelpText()

    expect(help).toContain("/status - Show gateway and OpenCode status")
    expect(help).toContain("/sessions - List and switch OpenCode sessions")
  })
})
```

Create `tests/core/chunkText.test.js`:

```js
import { describe, expect, test } from "vitest"
import { chunkText } from "../../src/core/formatting/chunkText.js"

describe("chunkText", () => {
  test("returns one chunk when text is below the limit", () => {
    expect(chunkText("hello", 10)).toEqual(["hello"])
  })

  test("splits text without exceeding the limit", () => {
    const chunks = chunkText("alpha beta gamma", 8)

    expect(chunks).toEqual(["alpha", "beta", "gamma"])
    expect(chunks.every((chunk) => chunk.length <= 8)).toBe(true)
  })

  test("splits long words at the limit", () => {
    expect(chunkText("abcdefghij", 4)).toEqual(["abcd", "efgh", "ij"])
  })
})
```

- [ ] **Step 2: Run tests to verify RED**

Run: `pnpm vitest run tests/core/commands.test.js tests/core/chunkText.test.js`

Expected: FAIL because command and chunking modules do not exist.

- [ ] **Step 3: Implement commands and chunking**

Create `src/core/commands/commands.js`:

```js
export const botCommands = [
  { command: "status", description: "Show gateway and OpenCode status" },
  { command: "new", description: "Create and select a new OpenCode session" },
  { command: "sessions", description: "List and switch OpenCode sessions" },
  { command: "stop", description: "Abort current OpenCode task" },
  { command: "help", description: "Show available commands" },
]

export function renderHelpText() {
  return [
    "OpenCode Gateway commands:",
    "",
    ...botCommands.map((command) => `/${command.command} - ${command.description}`),
  ].join("\n")
}
```

Create `src/core/formatting/chunkText.js`:

```js
export function chunkText(text, maxLength = 3900) {
  if (typeof text !== "string") {
    throw new TypeError("text must be a string")
  }
  if (!Number.isInteger(maxLength) || maxLength < 1) {
    throw new TypeError("maxLength must be a positive integer")
  }
  if (text.length <= maxLength) {
    return text.length === 0 ? [] : [text]
  }

  const chunks = []
  let remaining = text.trim()

  while (remaining.length > maxLength) {
    const slice = remaining.slice(0, maxLength + 1)
    const splitAt = Math.max(slice.lastIndexOf("\n"), slice.lastIndexOf(" "))

    if (splitAt > 0) {
      chunks.push(remaining.slice(0, splitAt).trim())
      remaining = remaining.slice(splitAt).trim()
    } else {
      chunks.push(remaining.slice(0, maxLength))
      remaining = remaining.slice(maxLength).trim()
    }
  }

  if (remaining.length > 0) {
    chunks.push(remaining)
  }

  return chunks
}
```

- [ ] **Step 4: Run tests to verify GREEN**

Run: `pnpm vitest run tests/core/commands.test.js tests/core/chunkText.test.js`

Expected: PASS.

- [ ] **Step 5: Commit commands and formatting**

Run: `git add src/core/commands src/core/formatting tests/core/commands.test.js tests/core/chunkText.test.js && git commit -m "feat: add commands and formatting"`

## Task 4: Settings Store

**Files:**
- Create: `tests/core/settingsStore.test.js`
- Create: `src/core/session/settingsStore.js`

- [ ] **Step 1: Write failing settings tests**

Create `tests/core/settingsStore.test.js`:

```js
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { afterEach, describe, expect, test } from "vitest"
import { createSettingsStore } from "../../src/core/session/settingsStore.js"

const tempDirs = []

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })))
  tempDirs.length = 0
})

async function tempSettingsPath() {
  const dir = await mkdtemp(join(tmpdir(), "opencode-gateway-"))
  tempDirs.push(dir)
  return join(dir, "settings.json")
}

describe("settingsStore", () => {
  test("returns defaults when settings file does not exist", async () => {
    const store = createSettingsStore(await tempSettingsPath())

    await expect(store.read()).resolves.toEqual({ activeSessionId: null })
  })

  test("persists active session ID", async () => {
    const store = createSettingsStore(await tempSettingsPath())

    await store.write({ activeSessionId: "ses_123" })

    await expect(store.read()).resolves.toEqual({ activeSessionId: "ses_123" })
  })
})
```

- [ ] **Step 2: Run test to verify RED**

Run: `pnpm vitest run tests/core/settingsStore.test.js`

Expected: FAIL because settings store module does not exist.

- [ ] **Step 3: Implement settings store**

Create `src/core/session/settingsStore.js`:

```js
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname } from "node:path"

const defaultSettings = {
  activeSessionId: null,
}

export function createSettingsStore(filePath) {
  return {
    async read() {
      try {
        const raw = await readFile(filePath, "utf8")
        const parsed = JSON.parse(raw)
        return { ...defaultSettings, ...parsed }
      } catch (error) {
        if (error && error.code === "ENOENT") {
          return { ...defaultSettings }
        }
        throw error
      }
    },

    async write(settings) {
      await mkdir(dirname(filePath), { recursive: true })
      const next = { ...defaultSettings, ...settings }
      await writeFile(filePath, `${JSON.stringify(next, null, 2)}\n`, "utf8")
    },
  }
}
```

- [ ] **Step 4: Run test to verify GREEN**

Run: `pnpm vitest run tests/core/settingsStore.test.js`

Expected: PASS.

- [ ] **Step 5: Commit settings store**

Run: `git add src/core/session tests/core/settingsStore.test.js && git commit -m "feat: persist gateway settings"`

## Task 5: OpenCode Server Manager

**Files:**
- Create: `tests/core/serverManager.test.js`
- Create: `src/core/opencode/serverManager.js`

- [ ] **Step 1: Write failing server manager tests**

Create `tests/core/serverManager.test.js`:

```js
import { describe, expect, test, vi } from "vitest"
import { ensureOpenCodeServer } from "../../src/core/opencode/serverManager.js"

describe("ensureOpenCodeServer", () => {
  test("does not start a child process when server is already reachable", async () => {
    const processFactory = vi.fn()
    const manager = await ensureOpenCodeServer({
      apiUrl: "http://localhost:4096",
      command: "opencode",
      autoStart: true,
      workdir: process.cwd(),
      isReachable: vi.fn().mockResolvedValue(true),
      processFactory,
      waitMs: 0,
    })

    expect(manager.started).toBe(false)
    expect(processFactory).not.toHaveBeenCalled()
  })

  test("starts opencode serve when unreachable and auto-start is enabled", async () => {
    const child = { kill: vi.fn(), stdout: null, stderr: null }
    const processFactory = vi.fn().mockReturnValue(child)
    const isReachable = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)

    const manager = await ensureOpenCodeServer({
      apiUrl: "http://localhost:4096",
      command: "opencode",
      autoStart: true,
      workdir: "/tmp/project",
      isReachable,
      processFactory,
      waitMs: 0,
      maxAttempts: 2,
    })

    expect(manager.started).toBe(true)
    expect(processFactory).toHaveBeenCalledWith("opencode", ["serve"], {
      cwd: "/tmp/project",
      stdio: "pipe",
    })

    await manager.stop()
    expect(child.kill).toHaveBeenCalledWith("SIGTERM")
  })

  test("throws when unreachable and auto-start is disabled", async () => {
    await expect(
      ensureOpenCodeServer({
        apiUrl: "http://localhost:4096",
        command: "opencode",
        autoStart: false,
        workdir: process.cwd(),
        isReachable: vi.fn().mockResolvedValue(false),
        processFactory: vi.fn(),
        waitMs: 0,
      }),
    ).rejects.toThrow(/OpenCode server is not reachable/)
  })
})
```

- [ ] **Step 2: Run test to verify RED**

Run: `pnpm vitest run tests/core/serverManager.test.js`

Expected: FAIL because server manager module does not exist.

- [ ] **Step 3: Implement server manager**

Create `src/core/opencode/serverManager.js`:

```js
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
```

- [ ] **Step 4: Run test to verify GREEN**

Run: `pnpm vitest run tests/core/serverManager.test.js`

Expected: PASS.

- [ ] **Step 5: Commit server manager**

Run: `git add src/core/opencode/serverManager.js tests/core/serverManager.test.js && git commit -m "feat: manage opencode server lifecycle"`

## Task 6: OpenCode Wrapper And Gateway Controller

**Files:**
- Create: `tests/core/controller.test.js`
- Create: `src/core/opencode/client.js`
- Create: `src/core/gateway/controller.js`

- [ ] **Step 1: Write failing controller tests**

Create `tests/core/controller.test.js`:

```js
import { describe, expect, test, vi } from "vitest"
import { createGatewayController } from "../../src/core/gateway/controller.js"

function createStore(initial = { activeSessionId: null }) {
  let state = initial
  return {
    read: vi.fn(async () => state),
    write: vi.fn(async (next) => {
      state = { ...state, ...next }
    }),
  }
}

describe("gatewayController", () => {
  test("creates and selects a session", async () => {
    const store = createStore()
    const opencode = {
      createSession: vi.fn(async () => ({ id: "ses_1", title: "New session" })),
    }
    const controller = createGatewayController({ opencode, store })

    const result = await controller.createSession()

    expect(result).toEqual({ id: "ses_1", title: "New session" })
    expect(store.write).toHaveBeenCalledWith({ activeSessionId: "ses_1" })
  })

  test("sends prompt to active session", async () => {
    const store = createStore({ activeSessionId: "ses_1" })
    const opencode = {
      sendPrompt: vi.fn(async () => "answer"),
    }
    const controller = createGatewayController({ opencode, store })

    await expect(controller.sendPrompt("hello")).resolves.toBe("answer")
    expect(opencode.sendPrompt).toHaveBeenCalledWith("ses_1", "hello")
  })

  test("creates a session before first prompt when none is active", async () => {
    const store = createStore()
    const opencode = {
      createSession: vi.fn(async () => ({ id: "ses_2", title: "Auto" })),
      sendPrompt: vi.fn(async () => "answer"),
    }
    const controller = createGatewayController({ opencode, store })

    await expect(controller.sendPrompt("hello")).resolves.toBe("answer")
    expect(opencode.sendPrompt).toHaveBeenCalledWith("ses_2", "hello")
  })
})
```

- [ ] **Step 2: Run test to verify RED**

Run: `pnpm vitest run tests/core/controller.test.js`

Expected: FAIL because controller module does not exist.

- [ ] **Step 3: Implement wrapper and controller**

Create `src/core/opencode/client.js`:

```js
import Opencode from "@opencode-ai/sdk"

export class GatewayOpenCodeError extends Error {
  constructor(message, cause) {
    super(message)
    this.name = "GatewayOpenCodeError"
    this.cause = cause
  }
}

export function createOpenCodeClient({ apiUrl, sdkClient = null } = {}) {
  const client = sdkClient ?? new Opencode({ baseURL: apiUrl })

  return {
    async listSessions() {
      try {
        return await client.session.list()
      } catch (error) {
        throw new GatewayOpenCodeError("Could not list OpenCode sessions", error)
      }
    },

    async createSession() {
      try {
        if (client.session.create) {
          return await client.session.create()
        }
        throw new Error("OpenCode SDK does not expose session.create")
      } catch (error) {
        throw new GatewayOpenCodeError("Could not create OpenCode session", error)
      }
    },

    async sendPrompt(sessionId, prompt) {
      try {
        const response = await client.session.message(sessionId, {
          parts: [{ type: "text", content: prompt }],
        })
        return extractText(response)
      } catch (error) {
        throw new GatewayOpenCodeError("Could not send prompt to OpenCode", error)
      }
    },

    async stopSession(sessionId) {
      try {
        if (client.session.abort) {
          return await client.session.abort(sessionId)
        }
        return false
      } catch (error) {
        throw new GatewayOpenCodeError("Could not stop OpenCode session", error)
      }
    },
  }
}

function extractText(response) {
  if (typeof response === "string") {
    return response
  }
  const parts = response?.parts ?? []
  const text = parts
    .filter((part) => part.type === "text" && typeof part.content === "string")
    .map((part) => part.content)
    .join("\n")
  return text || "OpenCode returned no text response."
}
```

Create `src/core/gateway/controller.js`:

```js
export function createGatewayController({ opencode, store }) {
  async function getActiveSessionId() {
    const settings = await store.read()
    if (settings.activeSessionId) {
      return settings.activeSessionId
    }
    const session = await createSession()
    return session.id
  }

  async function createSession() {
    const session = await opencode.createSession()
    await store.write({ activeSessionId: session.id })
    return session
  }

  return {
    async status() {
      const settings = await store.read()
      return {
        activeSessionId: settings.activeSessionId,
      }
    },

    async createSession() {
      return createSession()
    },

    async listSessions() {
      return opencode.listSessions()
    },

    async selectSession(sessionId) {
      await store.write({ activeSessionId: sessionId })
      return { activeSessionId: sessionId }
    },

    async sendPrompt(prompt) {
      const sessionId = await getActiveSessionId()
      return opencode.sendPrompt(sessionId, prompt)
    },

    async stop() {
      const sessionId = await getActiveSessionId()
      return opencode.stopSession(sessionId)
    },
  }
}
```

- [ ] **Step 4: Run test to verify GREEN**

Run: `pnpm vitest run tests/core/controller.test.js`

Expected: PASS.

- [ ] **Step 5: Commit controller**

Run: `git add src/core/opencode/client.js src/core/gateway/controller.js tests/core/controller.test.js && git commit -m "feat: add gateway controller"`

## Task 7: Telegram Adapter And Runtime Wiring

**Files:**
- Create: `tests/adapters/telegramAuth.test.js`
- Create: `src/adapters/telegram/auth.js`
- Create: `src/adapters/telegram/bot.js`
- Create: `src/runtime/bootstrap.js`
- Create: `src/utils/logger.js`
- Create: `src/bin/gateway.js`

- [ ] **Step 1: Write failing Telegram auth tests**

Create `tests/adapters/telegramAuth.test.js`:

```js
import { describe, expect, test } from "vitest"
import { isAuthorizedTelegramUser } from "../../src/adapters/telegram/auth.js"

describe("isAuthorizedTelegramUser", () => {
  test("allows the configured Telegram user ID", () => {
    expect(isAuthorizedTelegramUser({ from: { id: 123 } }, 123)).toBe(true)
  })

  test("rejects other Telegram user IDs", () => {
    expect(isAuthorizedTelegramUser({ from: { id: 999 } }, 123)).toBe(false)
  })

  test("rejects updates without a sender", () => {
    expect(isAuthorizedTelegramUser({}, 123)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify RED**

Run: `pnpm vitest run tests/adapters/telegramAuth.test.js`

Expected: FAIL because auth module does not exist.

- [ ] **Step 3: Implement Telegram adapter and runtime files**

Create `src/adapters/telegram/auth.js`:

```js
export function isAuthorizedTelegramUser(ctx, allowedUserId) {
  return ctx?.from?.id === allowedUserId
}
```

Create `src/adapters/telegram/bot.js`:

```js
import { Bot, InlineKeyboard } from "grammy"
import { botCommands, renderHelpText } from "../../core/commands/commands.js"
import { chunkText } from "../../core/formatting/chunkText.js"
import { isAuthorizedTelegramUser } from "./auth.js"

export function createTelegramBot({ token, allowedUserId, controller, logger, botFactory = Bot }) {
  const bot = new botFactory(token)

  bot.use(async (ctx, next) => {
    if (!isAuthorizedTelegramUser(ctx, allowedUserId)) {
      logger.warn({ userId: ctx.from?.id }, "Ignoring unauthorized Telegram update")
      return
    }
    await next()
  })

  bot.api.setMyCommands(botCommands).catch((error) => {
    logger.warn({ error }, "Could not register Telegram commands")
  })

  bot.command("help", async (ctx) => ctx.reply(renderHelpText()))

  bot.command("status", async (ctx) => {
    const status = await controller.status()
    await ctx.reply(`Gateway is running. Active session: ${status.activeSessionId ?? "none"}`)
  })

  bot.command("new", async (ctx) => {
    const session = await controller.createSession()
    await ctx.reply(`Created session ${session.title ?? session.id}`)
  })

  bot.command("sessions", async (ctx) => {
    const sessions = await controller.listSessions()
    if (sessions.length === 0) {
      await ctx.reply("No OpenCode sessions found. Use /new to create one.")
      return
    }

    const keyboard = new InlineKeyboard()
    for (const session of sessions.slice(0, 20)) {
      keyboard.text(session.title ?? session.id, `session:${session.id}`).row()
    }

    await ctx.reply("Select a session:", { reply_markup: keyboard })
  })

  bot.callbackQuery(/^session:(.+)$/u, async (ctx) => {
    const sessionId = ctx.match[1]
    await controller.selectSession(sessionId)
    await ctx.answerCallbackQuery({ text: "Session selected" })
    await ctx.reply(`Selected session ${sessionId}`)
  })

  bot.command("stop", async (ctx) => {
    await controller.stop()
    await ctx.reply("Stop requested for the active OpenCode session.")
  })

  bot.on("message:text", async (ctx) => {
    if (ctx.message.text.startsWith("/")) {
      return
    }
    await ctx.reply("Sending prompt to OpenCode...")
    const response = await controller.sendPrompt(ctx.message.text)
    for (const chunk of chunkText(response)) {
      await ctx.reply(chunk)
    }
  })

  return bot
}
```

Create `src/utils/logger.js`:

```js
import pino from "pino"

export function createLogger(level = "info") {
  return pino({ level })
}
```

Create `src/runtime/bootstrap.js`:

```js
import { createTelegramBot } from "../adapters/telegram/bot.js"
import { loadConfig } from "../config/loadConfig.js"
import { createGatewayController } from "../core/gateway/controller.js"
import { createOpenCodeClient } from "../core/opencode/client.js"
import { ensureOpenCodeServer } from "../core/opencode/serverManager.js"
import { createSettingsStore } from "../core/session/settingsStore.js"
import { createLogger } from "../utils/logger.js"

export async function runGateway({ config = loadConfig(), logger = createLogger(config.logLevel) } = {}) {
  const server = await ensureOpenCodeServer(config.opencode)
  const opencode = createOpenCodeClient({ apiUrl: config.opencode.apiUrl })
  const store = createSettingsStore(config.settingsPath)
  const controller = createGatewayController({ opencode, store })
  const bot = createTelegramBot({
    token: config.telegram.botToken,
    allowedUserId: config.telegram.allowedUserId,
    controller,
    logger,
  })

  let stopping = false
  async function shutdown(signal) {
    if (stopping) {
      return
    }
    stopping = true
    logger.info({ signal }, "Shutting down gateway")
    await bot.stop()
    await server.stop()
  }

  process.once("SIGINT", shutdown)
  process.once("SIGTERM", shutdown)

  logger.info("Starting Telegram polling")
  await bot.start()
}
```

Create `src/bin/gateway.js`:

```js
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

program.parseAsync(process.argv)
```

- [ ] **Step 4: Run test to verify GREEN**

Run: `pnpm vitest run tests/adapters/telegramAuth.test.js`

Expected: PASS.

- [ ] **Step 5: Commit Telegram and runtime wiring**

Run: `git add src/adapters src/runtime src/utils src/bin tests/adapters/telegramAuth.test.js && git commit -m "feat: add telegram polling runtime"`

## Task 8: Full Verification

**Files:**
- Modify only if verification reveals a defect in files from earlier tasks.

- [ ] **Step 1: Run all tests**

Run: `pnpm test`

Expected: all Vitest tests pass.

- [ ] **Step 2: Run lint and format check**

Run: `pnpm run lint`

Expected: Biome reports no errors.

- [ ] **Step 3: Run combined check**

Run: `pnpm run check`

Expected: lint and tests pass.

- [ ] **Step 4: Inspect final git state**

Run: `git status --short`

Expected: clean working tree or only intentional uncommitted documentation changes.

## Plan Self-Review

- Spec coverage: The plan covers Node.js 24/22 support, pnpm, Biome, Vitest, no Hono, grammY polling, OpenCode auto-start, text-first commands, settings persistence, safe chunking, and deferred voice/webhook/background mode.
- Placeholder scan: No task contains placeholder markers or unspecified implementation steps.
- Type consistency: The controller API used by Telegram matches `createGatewayController`; config shape used by runtime matches `loadConfigFromEnv`; settings store shape uses `activeSessionId` consistently.
