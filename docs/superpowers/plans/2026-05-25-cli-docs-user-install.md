# CLI Docs And Background Commands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `opencode-remote` the only public CLI, split user and development docs, and add foreground, setup, background start, stop, and status commands.

**Architecture:** Keep commander wiring in `src/bin/program.js`, keep config creation in `src/config/setupConfig.js`, and add a focused `src/runtime/background.js` helper for PID/log lifecycle behavior. Background mode starts the same CLI entry with `run`, stores `gateway.pid` and `gateway.log` beside the selected config, and uses safe process checks for status and stop.

**Tech Stack:** Node.js ESM, commander, Vitest, Biome, tsdown, npm package bins.

---

This repository requires explicit user approval before committing. The checkpoint steps below inspect status/diff instead of running `git commit`.

## File Structure

- Modify `src/config/setupConfig.js`: expose explicit `createConfig()` for `opencode-remote setup`, retain `loadOrCreateConfig()` for `run` and `start`, add overwrite confirmation for existing config.
- Create `src/runtime/background.js`: derive PID/log paths, inspect PID files, start detached gateway, stop gateway, report status.
- Modify `src/bin/program.js`: rename program to `opencode-remote`, add `setup`, `start`, `stop`, and `status`, keep `run`, inject lifecycle dependencies for tests.
- Rename `src/bin/gateway.js` to `src/bin/opencode-remote.js`: keep the same shebang and parse behavior.
- Modify `tsdown.config.js`: build `dist/bin/opencode-remote.mjs` from `src/bin/opencode-remote.js`.
- Modify `package.json`: remove public `gateway` bin, point `opencode-remote` to `dist/bin/opencode-remote.mjs`, update source scripts.
- Modify `src/index.js`: keep package exports unchanged unless the new lifecycle helpers need public export; default is no public export.
- Modify `tests/config/loadConfig.test.js`: cover explicit setup overwrite and no-overwrite behavior.
- Create `tests/runtime/background.test.js`: cover PID status, stale PID handling, start, stop, invalid PID content.
- Modify `tests/bin/gatewayProgram.test.js`: cover new CLI command handlers and program name.
- Modify `tests/smoke/packageSmoke.js`: expect only `opencode-remote` bin and new dist bin path.
- Rewrite `README.md`: user install, setup, usage, config, Telegram commands, troubleshooting only.
- Add `DEVELOPMENT.md`: dependency install, source run/watch, tests, build, smoke, release workflow.
- Modify `FEATURES.md`, `CHANGELOG.md`, `TODO.md`, and `AGENTS.md`: align command names, bin list, docs split, and background lifecycle.

### Task 1: Explicit Config Setup API

**Files:**
- Modify: `src/config/setupConfig.js`
- Modify: `tests/config/loadConfig.test.js`

- [ ] **Step 1: Add failing tests for explicit setup behavior**

Add these imports in `tests/config/loadConfig.test.js`:

```js
import { createConfig, loadOrCreateConfig } from "../../src/config/setupConfig.js"
```

Replace the existing setup import line:

```js
import { loadOrCreateConfig } from "../../src/config/setupConfig.js"
```

with the combined import above.

Append these tests after the existing `loadOrCreateConfig` tests:

```js
describe("createConfig", () => {
  test("prompts before replacing an existing local config", async () => {
    const { cwd, homeDir } = await tempWorkspace()
    const existingPath = join(cwd, ".opencode-remote", "config.json")
    await writeConfig(existingPath, {
      telegram: { botToken: "old-token", allowedUserId: 111 },
    })
    const confirmOverwrite = vi.fn(async () => true)
    const prompter = vi.fn(async () => ({
      scope: "local",
      config: {
        telegram: { botToken: "new-token", allowedUserId: 222 },
      },
    }))

    const config = await createConfig({ cwd, homeDir, prompter, confirmOverwrite })

    expect(confirmOverwrite).toHaveBeenCalledWith(existingPath)
    expect(config.telegram).toEqual({ botToken: "new-token", allowedUserId: 222 })
    await expect(readJson(existingPath)).resolves.toMatchObject({
      telegram: { botToken: "new-token", allowedUserId: 222 },
    })
  })

  test("keeps an existing config when overwrite is declined", async () => {
    const { cwd, homeDir } = await tempWorkspace()
    const existingPath = join(cwd, ".opencode-remote", "config.json")
    await writeConfig(existingPath, {
      telegram: { botToken: "old-token", allowedUserId: 333 },
    })
    const confirmOverwrite = vi.fn(async () => false)
    const prompter = vi.fn(async () => ({
      scope: "local",
      config: {
        telegram: { botToken: "new-token", allowedUserId: 444 },
      },
    }))

    const config = await createConfig({ cwd, homeDir, prompter, confirmOverwrite })

    expect(confirmOverwrite).toHaveBeenCalledWith(existingPath)
    expect(prompter).not.toHaveBeenCalled()
    expect(config.telegram).toEqual({ botToken: "old-token", allowedUserId: 333 })
    await expect(readJson(existingPath)).resolves.toMatchObject({
      telegram: { botToken: "old-token", allowedUserId: 333 },
    })
  })
})
```

- [ ] **Step 2: Run the focused config tests to verify failure**

Run: `pnpm vitest run tests/config/loadConfig.test.js`

Expected: FAIL because `createConfig` is not exported.

- [ ] **Step 3: Implement explicit setup creation**

Modify `src/config/setupConfig.js` so the top-level exports include `createConfig` and an overwrite confirmation helper. Keep the existing prompt wording for missing config.

Use this structure:

```js
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

  return createConfig({ cwd, homeDir, prompter, skipExistingCheck: true })
}

export async function createConfig({
  cwd = process.cwd(),
  homeDir,
  prompter = promptForConfig,
  confirmOverwrite = confirmOverwriteConfig,
  skipExistingCheck = false,
} = {}) {
  if (!skipExistingCheck) {
    try {
      const existingConfig = await loadConfig({ cwd, homeDir })
      if (!(await confirmOverwrite(existingConfig.configPath))) {
        return existingConfig
      }
    } catch (error) {
      if (error?.code !== "missing_config") {
        throw error
      }
    }
  }

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
```

Add this helper near the existing prompt helpers:

```js
export async function confirmOverwriteConfig(configPath) {
  const rl = createInterface({ input, output })

  try {
    return askBoolean(rl, `Config already exists at ${configPath}. Replace it`, false)
  } finally {
    rl.close()
  }
}
```

- [ ] **Step 4: Run focused config tests to verify pass**

Run: `pnpm vitest run tests/config/loadConfig.test.js`

Expected: PASS.

- [ ] **Step 5: Review checkpoint**

Run: `git diff -- src/config/setupConfig.js tests/config/loadConfig.test.js`

Expected: diff only contains explicit config setup support and tests.

### Task 2: Background Lifecycle Helper

**Files:**
- Create: `src/runtime/background.js`
- Create: `tests/runtime/background.test.js`

- [ ] **Step 1: Write failing lifecycle tests**

Create `tests/runtime/background.test.js` with this content:

```js
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, test, vi } from "vitest"
import {
  getGatewayBackgroundStatus,
  getGatewayLifecyclePaths,
  startGatewayInBackground,
  stopGatewayInBackground,
} from "../../src/runtime/background.js"

const tempDirs = []

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })))
  tempDirs.length = 0
})

describe("gateway background lifecycle", () => {
  test("derives PID and log paths beside the selected config", async () => {
    const root = await tempRoot()
    const config = testConfig(join(root, ".opencode-remote", "config.json"))

    expect(getGatewayLifecyclePaths(config)).toEqual({
      pidPath: join(root, ".opencode-remote", "gateway.pid"),
      logPath: join(root, ".opencode-remote", "gateway.log"),
    })
  })

  test("reports stopped when no PID file exists", async () => {
    const root = await tempRoot()
    const config = testConfig(join(root, ".opencode-remote", "config.json"))

    await expect(getGatewayBackgroundStatus({ config })).resolves.toMatchObject({
      status: "stopped",
    })
  })

  test("reports running when PID file points to a live process", async () => {
    const root = await tempRoot()
    const config = testConfig(join(root, ".opencode-remote", "config.json"))
    const { pidPath } = getGatewayLifecyclePaths(config)
    await mkdir(join(root, ".opencode-remote"), { recursive: true })
    await writeFile(pidPath, "1234\n", "utf8")
    const processLike = { kill: vi.fn(() => true) }

    await expect(getGatewayBackgroundStatus({ config, processLike })).resolves.toMatchObject({
      status: "running",
      pid: 1234,
    })
  })

  test("reports stale when PID file content is invalid", async () => {
    const root = await tempRoot()
    const config = testConfig(join(root, ".opencode-remote", "config.json"))
    const { pidPath } = getGatewayLifecyclePaths(config)
    await mkdir(join(root, ".opencode-remote"), { recursive: true })
    await writeFile(pidPath, "not-a-pid\n", "utf8")

    await expect(getGatewayBackgroundStatus({ config })).resolves.toMatchObject({
      status: "stale",
    })
  })

  test("starts a detached gateway and writes its PID", async () => {
    const root = await tempRoot()
    const config = testConfig(join(root, ".opencode-remote", "config.json"))
    const child = { pid: 5678, unref: vi.fn() }
    const spawnProcess = vi.fn(() => child)
    const processLike = {
      execPath: "/node",
      argv: ["/node", "/bin/opencode-remote.mjs", "start"],
      cwd: () => root,
      env: { TEST_ENV: "1" },
      kill: vi.fn(() => {
        const error = new Error("missing")
        error.code = "ESRCH"
        throw error
      }),
    }

    const result = await startGatewayInBackground({ config, processLike, spawnProcess })

    expect(result).toMatchObject({ status: "started", pid: 5678 })
    expect(spawnProcess).toHaveBeenCalledWith(
      "/node",
      ["/bin/opencode-remote.mjs", "run"],
      expect.objectContaining({
        detached: true,
        cwd: root,
        env: processLike.env,
      }),
    )
    expect(child.unref).toHaveBeenCalled()
    await expect(readFile(getGatewayLifecyclePaths(config).pidPath, "utf8")).resolves.toBe("5678\n")
  })

  test("does not start a second process when a live PID exists", async () => {
    const root = await tempRoot()
    const config = testConfig(join(root, ".opencode-remote", "config.json"))
    const { pidPath } = getGatewayLifecyclePaths(config)
    await mkdir(join(root, ".opencode-remote"), { recursive: true })
    await writeFile(pidPath, "2468\n", "utf8")
    const spawnProcess = vi.fn()
    const processLike = {
      execPath: "/node",
      argv: ["/node", "/bin/opencode-remote.mjs", "start"],
      cwd: () => root,
      env: {},
      kill: vi.fn(() => true),
    }

    const result = await startGatewayInBackground({ config, processLike, spawnProcess })

    expect(result).toMatchObject({ status: "already_running", pid: 2468 })
    expect(spawnProcess).not.toHaveBeenCalled()
  })

  test("stops a running background gateway and removes the PID file", async () => {
    const root = await tempRoot()
    const config = testConfig(join(root, ".opencode-remote", "config.json"))
    const { pidPath } = getGatewayLifecyclePaths(config)
    await mkdir(join(root, ".opencode-remote"), { recursive: true })
    await writeFile(pidPath, "1357\n", "utf8")
    const processLike = { kill: vi.fn(() => true) }

    const result = await stopGatewayInBackground({ config, processLike })

    expect(result).toMatchObject({ status: "stopped", pid: 1357 })
    expect(processLike.kill).toHaveBeenCalledWith(1357, "SIGTERM")
    await expect(readFile(pidPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" })
  })

  test("removes stale PID file on stop", async () => {
    const root = await tempRoot()
    const config = testConfig(join(root, ".opencode-remote", "config.json"))
    const { pidPath } = getGatewayLifecyclePaths(config)
    await mkdir(join(root, ".opencode-remote"), { recursive: true })
    await writeFile(pidPath, "9753\n", "utf8")
    const processLike = {
      kill: vi.fn(() => {
        const error = new Error("missing")
        error.code = "ESRCH"
        throw error
      }),
    }

    const result = await stopGatewayInBackground({ config, processLike })

    expect(result).toMatchObject({ status: "stale", pid: 9753 })
    await expect(readFile(pidPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" })
  })
})

async function tempRoot() {
  const root = await mkdtemp(join(tmpdir(), "opencode-remote-background-"))
  tempDirs.push(root)
  return root
}

function testConfig(configPath) {
  return {
    configPath,
    telegram: { botToken: "token", allowedUserId: 123 },
    opencode: {
      apiUrl: "http://localhost:4096",
      command: "opencode",
      autoStart: true,
      workdir: process.cwd(),
    },
    logLevel: "silent",
    settingsPath: join(configPath, "..", "settings.json"),
    progressVerbosity: "all",
  }
}
```

- [ ] **Step 2: Run lifecycle tests to verify failure**

Run: `pnpm vitest run tests/runtime/background.test.js`

Expected: FAIL because `src/runtime/background.js` does not exist.

- [ ] **Step 3: Implement lifecycle helper**

Create `src/runtime/background.js` with this content:

```js
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
    const child = spawnProcess(
      processLike.execPath,
      [processLike.argv[1], "run"],
      {
        cwd: processLike.cwd(),
        detached: true,
        env: processLike.env,
        stdio: ["ignore", log.fd, log.fd],
      },
    )

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
```

- [ ] **Step 4: Run lifecycle tests to verify pass**

Run: `pnpm vitest run tests/runtime/background.test.js`

Expected: PASS.

- [ ] **Step 5: Review checkpoint**

Run: `git diff -- src/runtime/background.js tests/runtime/background.test.js`

Expected: diff only contains lifecycle helper and tests.

### Task 3: CLI Commands And Public Bin Rename

**Files:**
- Modify: `src/bin/program.js`
- Move: `src/bin/gateway.js` to `src/bin/opencode-remote.js`
- Modify: `tests/bin/gatewayProgram.test.js`
- Modify: `tsdown.config.js`
- Modify: `package.json`
- Modify: `tests/smoke/packageSmoke.js`

- [ ] **Step 1: Replace CLI program tests with the new command surface**

Replace `tests/bin/gatewayProgram.test.js` with this content:

```js
import { describe, expect, test, vi } from "vitest"
import { createGatewayProgram } from "../../src/bin/program.js"

describe("opencode-remote CLI program", () => {
  test("run command loads or creates config before starting the gateway", async () => {
    const config = testConfig()
    const loadOrCreateConfig = vi.fn(async () => config)
    const runGateway = vi.fn(async () => undefined)
    const program = createGatewayProgram({ loadOrCreateConfig, runGateway })

    await program.parseAsync(["node", "opencode-remote", "run"])

    expect(loadOrCreateConfig).toHaveBeenCalled()
    expect(runGateway).toHaveBeenCalledWith({ config })
  })

  test("setup command creates config without starting the gateway", async () => {
    const config = testConfig()
    const createConfig = vi.fn(async () => config)
    const runGateway = vi.fn(async () => undefined)
    const output = { write: vi.fn() }
    const program = createGatewayProgram({ createConfig, runGateway, output })

    await program.parseAsync(["node", "opencode-remote", "setup"])

    expect(createConfig).toHaveBeenCalled()
    expect(runGateway).not.toHaveBeenCalled()
    expect(output.write).toHaveBeenCalledWith(`Config ready: ${config.configPath}\n`)
  })

  test("start command loads or creates config before starting in background", async () => {
    const config = testConfig()
    const loadOrCreateConfig = vi.fn(async () => config)
    const startGatewayInBackground = vi.fn(async () => ({
      status: "started",
      pid: 1234,
      logPath: ".opencode-remote/gateway.log",
    }))
    const output = { write: vi.fn() }
    const program = createGatewayProgram({
      loadOrCreateConfig,
      startGatewayInBackground,
      output,
    })

    await program.parseAsync(["node", "opencode-remote", "start"])

    expect(loadOrCreateConfig).toHaveBeenCalled()
    expect(startGatewayInBackground).toHaveBeenCalledWith({ config })
    expect(output.write).toHaveBeenCalledWith(
      "Gateway started in background (PID 1234). Logs: .opencode-remote/gateway.log\n",
    )
  })

  test("start command reports an already running gateway", async () => {
    const config = testConfig()
    const output = { write: vi.fn() }
    const program = createGatewayProgram({
      loadOrCreateConfig: vi.fn(async () => config),
      startGatewayInBackground: vi.fn(async () => ({
        status: "already_running",
        pid: 2222,
        logPath: ".opencode-remote/gateway.log",
      })),
      output,
    })

    await program.parseAsync(["node", "opencode-remote", "start"])

    expect(output.write).toHaveBeenCalledWith(
      "Gateway is already running (PID 2222). Logs: .opencode-remote/gateway.log\n",
    )
  })

  test("stop command loads existing config and stops background gateway", async () => {
    const config = testConfig()
    const loadConfig = vi.fn(async () => config)
    const stopGatewayInBackground = vi.fn(async () => ({ status: "stopped", pid: 3333 }))
    const output = { write: vi.fn() }
    const program = createGatewayProgram({ loadConfig, stopGatewayInBackground, output })

    await program.parseAsync(["node", "opencode-remote", "stop"])

    expect(loadConfig).toHaveBeenCalled()
    expect(stopGatewayInBackground).toHaveBeenCalledWith({ config })
    expect(output.write).toHaveBeenCalledWith("Gateway stopped (PID 3333).\n")
  })

  test("status command reports running background gateway", async () => {
    const config = testConfig()
    const output = { write: vi.fn() }
    const program = createGatewayProgram({
      loadConfig: vi.fn(async () => config),
      getGatewayBackgroundStatus: vi.fn(async () => ({
        status: "running",
        pid: 4444,
        logPath: ".opencode-remote/gateway.log",
      })),
      output,
    })

    await program.parseAsync(["node", "opencode-remote", "status"])

    expect(output.write).toHaveBeenCalledWith(
      "Gateway is running (PID 4444). Logs: .opencode-remote/gateway.log\n",
    )
  })
})

function testConfig() {
  return {
    configPath: ".opencode-remote/config.json",
    telegram: { botToken: "token", allowedUserId: 123 },
    opencode: {
      apiUrl: "http://localhost:4096",
      command: "opencode",
      autoStart: true,
      workdir: process.cwd(),
    },
    logLevel: "silent",
    settingsPath: ".opencode-remote/settings.json",
    progressVerbosity: "all",
  }
}
```

- [ ] **Step 2: Run CLI tests to verify failure**

Run: `pnpm vitest run tests/bin/gatewayProgram.test.js`

Expected: FAIL because `setup`, `start`, `stop`, and `status` do not exist.

- [ ] **Step 3: Implement commander command wiring**

Replace `src/bin/program.js` with this content:

```js
import { Command } from "commander"
import { loadConfig as defaultLoadConfig } from "../config/loadConfig.js"
import {
  createConfig as defaultCreateConfig,
  loadOrCreateConfig as defaultLoadOrCreateConfig,
} from "../config/setupConfig.js"
import {
  getGatewayBackgroundStatus as defaultGetGatewayBackgroundStatus,
  startGatewayInBackground as defaultStartGatewayInBackground,
  stopGatewayInBackground as defaultStopGatewayInBackground,
} from "../runtime/background.js"
import { runGateway as defaultRunGateway } from "../runtime/bootstrap.js"

export function createGatewayProgram({
  createConfig = defaultCreateConfig,
  loadConfig = defaultLoadConfig,
  loadOrCreateConfig = defaultLoadOrCreateConfig,
  runGateway = defaultRunGateway,
  startGatewayInBackground = defaultStartGatewayInBackground,
  stopGatewayInBackground = defaultStopGatewayInBackground,
  getGatewayBackgroundStatus = defaultGetGatewayBackgroundStatus,
  output = process.stdout,
} = {}) {
  const program = new Command()

  program.name("opencode-remote").description("OpenCode messaging gateway").version("0.1.0")

  program
    .command("setup")
    .description("Create or replace the gateway config")
    .action(async () => {
      const config = await createConfig()
      output.write(`Config ready: ${config.configPath}\n`)
    })

  program
    .command("run")
    .description("Run the gateway in the foreground")
    .action(async () => {
      const config = await loadOrCreateConfig()
      await runGateway({ config })
    })

  program
    .command("start")
    .description("Run the gateway in the background")
    .action(async () => {
      const config = await loadOrCreateConfig()
      const result = await startGatewayInBackground({ config })
      output.write(formatStartResult(result))
    })

  program
    .command("stop")
    .description("Stop the background gateway")
    .action(async () => {
      const config = await loadConfig()
      const result = await stopGatewayInBackground({ config })
      output.write(formatStopResult(result))
    })

  program
    .command("status")
    .description("Show background gateway status")
    .action(async () => {
      const config = await loadConfig()
      const result = await getGatewayBackgroundStatus({ config })
      output.write(formatStatusResult(result))
    })

  return program
}

function formatStartResult(result) {
  if (result.status === "already_running") {
    return `Gateway is already running (PID ${result.pid}). Logs: ${result.logPath}\n`
  }

  return `Gateway started in background (PID ${result.pid}). Logs: ${result.logPath}\n`
}

function formatStopResult(result) {
  if (result.status === "not_running") {
    return "Gateway is not running.\n"
  }

  if (result.status === "stale") {
    return "Gateway is not running; removed stale PID file.\n"
  }

  return `Gateway stopped (PID ${result.pid}).\n`
}

function formatStatusResult(result) {
  if (result.status === "running") {
    return `Gateway is running (PID ${result.pid}). Logs: ${result.logPath}\n`
  }

  if (result.status === "stale") {
    return "Gateway is not running; PID file is stale.\n"
  }

  return "Gateway is not running.\n"
}
```

- [ ] **Step 4: Rename the source bin file**

Move `src/bin/gateway.js` to `src/bin/opencode-remote.js` and keep this content:

```js
#!/usr/bin/env node
import { createGatewayProgram } from "./program.js"

try {
  await createGatewayProgram().parseAsync(process.argv)
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
```

- [ ] **Step 5: Update package and build entry points**

Change `tsdown.config.js` entry from:

```js
entry: {
  index: "src/index.js",
  "bin/gateway": "src/bin/gateway.js",
},
```

to:

```js
entry: {
  index: "src/index.js",
  "bin/opencode-remote": "src/bin/opencode-remote.js",
},
```

Change `package.json` scripts and bin from:

```json
"bin": {
  "opencode-remote": "dist/bin/gateway.mjs",
  "gateway": "dist/bin/gateway.mjs"
},
"scripts": {
  "start": "node src/bin/gateway.js run",
  "dev": "node --watch src/bin/gateway.js run"
}
```

to:

```json
"bin": {
  "opencode-remote": "dist/bin/opencode-remote.mjs"
},
"scripts": {
  "start": "node src/bin/opencode-remote.js run",
  "dev": "node --watch src/bin/opencode-remote.js run"
}
```

Keep the existing `build`, `prepack`, `smoke:package`, `lint`, `format`, `test`, and `check` scripts unchanged.

- [ ] **Step 6: Update package smoke test expectations**

In `tests/smoke/packageSmoke.js`, remove the assertion for `packageJson.bin?.gateway` and assert the new bin path:

```js
assertEqual(
  packageJson.bin?.["opencode-remote"],
  "dist/bin/opencode-remote.mjs",
  "opencode-remote bin points at dist",
)
assert(
  !Object.hasOwn(packageJson.bin ?? {}, "gateway"),
  "package does not expose legacy gateway bin",
)
```

Change all `dist/bin/gateway.mjs` references in the smoke test to `dist/bin/opencode-remote.mjs`.

Change the required packed file from:

```js
"dist/bin/gateway.mjs",
```

to:

```js
"dist/bin/opencode-remote.mjs",
```

Add the old built bin to the forbidden list:

```js
for (const forbidden of [
  "dist/bin/gateway.mjs",
  "src/bin/gateway.js",
  "tests/config/loadConfig.test.js",
  ".env.example",
]) {
  assert(!packed.includes(forbidden), `package excludes ${forbidden}`)
}
```

- [ ] **Step 7: Run focused CLI tests**

Run: `pnpm vitest run tests/bin/gatewayProgram.test.js tests/runtime/background.test.js`

Expected: PASS.

- [ ] **Step 8: Run package smoke through the build**

Run: `pnpm run smoke:package`

Expected: PASS. The build creates `dist/bin/opencode-remote.mjs` and the smoke test confirms only `opencode-remote` is exposed.

- [ ] **Step 9: Review checkpoint**

Run: `git status --short`

Expected: shows the bin rename, program changes, lifecycle module, tests, package metadata, and build config changes. No generated `dist/` changes should be staged or manually edited.

### Task 4: User README And Development Docs Split

**Files:**
- Modify: `README.md`
- Create: `DEVELOPMENT.md`
- Modify: `FEATURES.md`
- Modify: `CHANGELOG.md`
- Modify: `TODO.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Rewrite README as user install and usage docs**

Replace `README.md` with this content:

```markdown
# OpenCode Remote

OpenCode Remote lets you use OpenCode from Telegram. It runs on your machine, connects to your local or remote OpenCode server, and forwards messages from one authorized Telegram user to OpenCode sessions.

This is a text-first Telegram MVP. Voice input, voice replies, model switching, permission callbacks, and multi-messenger support are not implemented yet.

See [Features](https://github.com/crankshift/opencode-remote/blob/main/FEATURES.md) for the full current capability list, [Changelog](https://github.com/crankshift/opencode-remote/blob/main/CHANGELOG.md) for release notes, and [TODO](https://github.com/crankshift/opencode-remote/blob/main/TODO.md) for planned work.

## Prerequisites

- Node.js 22.18.0 or newer. Node.js 24 LTS is recommended.
- OpenCode CLI available on the machine running the gateway.
- A Telegram bot token from BotFather.
- Your Telegram numeric user ID for the allowlist.

## Install

Install globally with npm:

```bash
npm install -g @crankshift/opencode-remote
```

Or with pnpm:

```bash
pnpm add -g @crankshift/opencode-remote
```

The package installs the `opencode-remote` command.

## Setup

Create the config interactively:

```bash
opencode-remote setup
```

The setup flow asks whether to write a project-local or global config, then prompts for the Telegram token, allowed Telegram user ID, OpenCode connection settings, progress verbosity, log level, and settings path.

Config discovery order:

1. Project-local `./.opencode-remote/config.json` in the current working directory.
2. Global `~/.opencode-remote/config.json`.

Local project config is useful when different projects need different OpenCode workdirs or Telegram bots. Global config is useful for one machine-wide gateway setup.

If no config exists, `opencode-remote run` and `opencode-remote start` run setup automatically before starting the gateway.

## Running

Run in the foreground:

```bash
opencode-remote run
```

Stop the foreground gateway with `Ctrl+C`.

Run in the background:

```bash
opencode-remote start
```

Check background status:

```bash
opencode-remote status
```

Stop the background gateway:

```bash
opencode-remote stop
```

Background mode writes runtime files beside the selected config:

- `.opencode-remote/gateway.pid` stores the background process ID.
- `.opencode-remote/gateway.log` stores background stdout and stderr.

On startup, the gateway checks `opencode.apiUrl`. If it is reachable, the gateway uses that server. If it is not reachable and `opencode.autoStart=true`, the gateway starts `opencode.command serve` and waits for it to become reachable before starting Telegram polling. Before polling starts, the gateway refreshes Telegram's slash-command menu for default and private chats.

If the gateway started the OpenCode child process, it stops that child during shutdown. It does not stop an OpenCode server that was already running.

## Configuration

The config file is JSON:

```json
{
  "telegram": {
    "botToken": "123456:telegram-bot-token",
    "allowedUserId": 123456789
  },
  "opencode": {
    "apiUrl": "http://localhost:4096",
    "command": "opencode",
    "autoStart": true,
    "workdir": null
  },
  "progressVerbosity": "all",
  "logLevel": "info"
}
```

`telegram.botToken` is required. It is the token for the bot that receives Telegram messages.

`telegram.allowedUserId` is required. Updates from other Telegram users are ignored.

`opencode.apiUrl` is the OpenCode server URL. The default is `http://localhost:4096`.

`opencode.command` is the executable used when the gateway starts OpenCode itself. The default is `opencode`.

`opencode.autoStart` controls whether the gateway runs `opencode serve` if `opencode.apiUrl` is not reachable. Set it to `false` if you want to manage the OpenCode server yourself.

`opencode.workdir` is the working directory used when auto-starting OpenCode. If omitted or `null`, the gateway uses the current process directory.

`progressVerbosity` controls the startup default for the prompt activity message. Supported values are `off`, `new`, `all`, and `verbose`. The default is `all`, which shows every distinct tool or skill invocation. The Telegram `/progress` command can change this at runtime and persists the selected value in the settings file.

`logLevel` controls structured log verbosity. Supported values are `fatal`, `error`, `warn`, `info`, `debug`, `trace`, and `silent`.

`settingsPath` is optional. If omitted, gateway state is stored beside the selected config as `.opencode-remote/settings.json`. Do not store secrets in the settings file.

Keep `config.json` private because it contains your Telegram bot token. Project-local `.opencode-remote/` is ignored by git.

## Telegram Commands

The bot currently supports:

```text
/status    Show gateway and active session status
/new       Create and select a new OpenCode session
/sessions  List OpenCode sessions and select one with inline buttons
/stop      Request stop for the active OpenCode session
/progress  Show or set tool progress visibility: off, new, all, verbose
/help      Show available commands
```

Any non-command text message from the authorized Telegram user is sent to OpenCode as a prompt. If no active session is selected, the gateway creates one automatically.

Telegram photo albums are handled as one OpenCode prompt when Telegram provides a shared `media_group_id`. The album caption becomes the prompt text. Separate text messages sent after an album are treated as separate prompts.

## Troubleshooting

If startup fails with a configuration error, check the selected `.opencode-remote/config.json` and make sure `telegram.botToken` is non-empty and `telegram.allowedUserId` is numeric.

If Telegram messages appear to be ignored, confirm that `telegram.allowedUserId` matches your Telegram user ID, not the bot ID or chat ID.

If startup fails because OpenCode is unreachable, either start OpenCode yourself at `opencode.apiUrl` or set `opencode.autoStart=true` and make sure `opencode.command` is available in `PATH`.

If auto-start fails, check `opencode.workdir`. The gateway starts `opencode serve` from that directory, or from the current process directory when `opencode.workdir` is empty.

If background mode does not start, run `opencode-remote status` and inspect `.opencode-remote/gateway.log` beside the selected config.

If `opencode-remote status` reports a stale PID file, run `opencode-remote stop` once to remove it.

If session selection is not preserved, check that the parent directory for the settings file is writable. The default path is `.opencode-remote/settings.json` beside the selected config.
```

- [ ] **Step 2: Create development docs**

Create `DEVELOPMENT.md` with this content:

```markdown
# Development

Development notes for `@crankshift/opencode-remote`.

## Prerequisites

- Node.js 22.18.0 or newer. Node.js 24 LTS is recommended.
- pnpm 10.11.0.

## Install Dependencies

```bash
pnpm install
```

## Run From Source

Run the gateway from source:

```bash
pnpm start
```

Run in watch mode during development:

```bash
pnpm dev
```

Both scripts execute `src/bin/opencode-remote.js run`.

## Build

Build the publishable package output:

```bash
pnpm run build
```

The build uses `tsdown` and writes ESM output to `dist/`.

## Checks

Run linting:

```bash
pnpm run lint
```

Run tests:

```bash
pnpm test
```

Run the package smoke check:

```bash
pnpm run smoke:package
```

Run the full local check:

```bash
pnpm run check
```

Default tests mock external systems. They do not require live Telegram, live OpenCode, Groq, or TTS services.

## Release

Releases publish to npm from GitHub Actions using npm trusted publishing. The repository does not need an `NPM_TOKEN` secret.

Before using tag-triggered releases, configure a trusted publisher for `@crankshift/opencode-remote` on npmjs.com. It must match the GitHub repository and workflow filename `publish.yml`.

To publish a release:

1. Update `package.json` version and `CHANGELOG.md`.
2. Run `pnpm run check`.
3. Commit the release changes.
4. Tag the commit with `vX.Y.Z`, matching the package version.
5. Push the commit and tag.
6. Verify the `Publish to npm` GitHub Actions workflow completes and the package appears on npm.

The workflow runs `pnpm run check` before `npm publish --access public`.
```

- [ ] **Step 3: Update feature docs**

In `FEATURES.md`, change the package bullet from:

```markdown
- Published npm CLI package with `gateway` and `opencode-remote` bins built to `dist/` with `tsdown`.
```

to:

```markdown
- Published npm CLI package with the `opencode-remote` bin built to `dist/` with `tsdown`.
- Background gateway lifecycle commands: `opencode-remote start`, `opencode-remote stop`, and `opencode-remote status`.
```

- [ ] **Step 4: Update changelog**

In `CHANGELOG.md` under `## Unreleased`, add:

```markdown
### Added

- Added `opencode-remote setup`, `opencode-remote start`, `opencode-remote stop`, and `opencode-remote status` CLI commands.
- Added background gateway PID and log management beside the selected config.
- Added `DEVELOPMENT.md` for source, test, build, and release workflow notes.

### Changed

- Changed the public package command surface to the single `opencode-remote` bin.
- Moved development and release instructions out of `README.md` so the README focuses on user install and usage.

### Removed

- Removed the legacy `gateway` package bin.
```

Also change the existing 0.1.2 line:

```markdown
- Added interactive JSON config setup for `gateway run` when no config exists.
```

to:

```markdown
- Added interactive JSON config setup for the foreground CLI run command when no config exists.
```

- [ ] **Step 5: Update roadmap wording**

In `TODO.md`, change the completed npm package sub-bullet from:

```markdown
- Add README install/run docs for `npm install -g @crankshift/opencode-remote`, `pnpm add -g @crankshift/opencode-remote`, and `gateway run`.
```

to:

```markdown
- Add README install/run docs for `npm install -g @crankshift/opencode-remote`, `pnpm add -g @crankshift/opencode-remote`, and `opencode-remote run`.
```

Change the startup behavior bullet from:

```markdown
- When `gateway run` starts and OpenCode is not running, prompt the CLI user before starting `opencode serve`.
```

to:

```markdown
- When `opencode-remote run` starts and OpenCode is not running, prompt the CLI user before starting `opencode serve`.
```

- [ ] **Step 6: Update agent guide**

In `AGENTS.md`, update these exact phrases:

```markdown
src/bin/gateway.js                 CLI entry
src/bin/program.js                 commander command `gateway run`
```

to:

```markdown
src/bin/opencode-remote.js         CLI entry
src/bin/program.js                 commander commands for `opencode-remote`
```

Change the implemented package bullet to mention the single bin and background lifecycle:

```markdown
- Publishable npm package output is built to `dist/` with `tsdown`.
- Public CLI bin is `opencode-remote`.
- Background CLI lifecycle supports `opencode-remote start`, `opencode-remote stop`, and `opencode-remote status`.
```

Change config setup references from `gateway run` to `opencode-remote run`.

Add lifecycle files to the config section:

```markdown
- Background runtime files are stored beside the selected config as `.opencode-remote/gateway.pid` and `.opencode-remote/gateway.log` by default.
```

- [ ] **Step 7: Search for removed user-facing command names**

Run: `rg "gateway run|gateway bin|src/bin/gateway|dist/bin/gateway|gateway\.mjs" README.md DEVELOPMENT.md FEATURES.md CHANGELOG.md TODO.md AGENTS.md package.json tsdown.config.js tests src`

Expected: no matches except historical docs under `docs/superpowers/` if the command searches outside the listed paths. If matches remain in the listed files, update them to `opencode-remote` wording.

- [ ] **Step 8: Run README/package smoke check**

Run: `pnpm run smoke:package`

Expected: PASS. The README must not contain relative Markdown links that break on npm package pages.

- [ ] **Step 9: Review checkpoint**

Run: `git diff -- README.md DEVELOPMENT.md FEATURES.md CHANGELOG.md TODO.md AGENTS.md`

Expected: README is user-focused, DEVELOPMENT contains development workflows, and public docs no longer tell users to run `gateway run`.

### Task 5: Full Verification

**Files:**
- No new source files expected.
- Verification covers the full changed tree.

- [ ] **Step 1: Run lint**

Run: `pnpm run lint`

Expected: PASS.

- [ ] **Step 2: Run tests**

Run: `pnpm test`

Expected: PASS.

- [ ] **Step 3: Run full check**

Run: `pnpm run check`

Expected: PASS. This repeats lint/tests and runs package smoke after building.

- [ ] **Step 4: Inspect final status**

Run: `git status --short`

Expected: modified files are limited to the implementation, docs, tests, spec, and plan for this change. `dist/` should not appear unless the repository intentionally tracks built output.

- [ ] **Step 5: Inspect final diff**

Run: `git diff --stat`

Expected: changes align with CLI lifecycle, docs split, package bin rename, and tests. No unrelated files should be changed.

## Self-Review

- Spec coverage: CLI single-bin behavior is covered by Task 3; explicit setup and auto setup are covered by Tasks 1 and 3; background lifecycle is covered by Task 2; docs split is covered by Task 4; verification is covered by Task 5.
- Placeholder scan: all task steps include concrete files, code snippets, commands, and expected results.
- Type consistency: lifecycle result statuses are `started`, `already_running`, `not_running`, `stopped`, `stale`, and `running`; the CLI formatter snippets use those same strings.
