# Setup Current Defaults Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `opencode-remote setup` reuse existing selected-scope config values when the user presses Enter on later prompts.

**Architecture:** Keep setup behavior in `src/config/setupConfig.js`. The first `local/global` prompt remains unchanged; after that selection, setup loads only the selected config file and passes its validated values as current prompt defaults. Normal runtime config discovery in `src/config/loadConfig.js` remains unchanged.

**Tech Stack:** Node.js ESM, readline prompts, Vitest, Biome, existing JSON config loader.

---

### Task 1: Preserve selected-scope current values

**Files:**
- Modify: `tests/config/loadConfig.test.js`
- Modify: `src/config/setupConfig.js`

- [ ] **Step 1: Write failing tests**

Add tests under `describe("promptForConfig", ...)`:

```js
  test("uses existing local config values when local setup input is blank", async () => {
    const { cwd, homeDir } = await tempWorkspace()
    const localConfigPath = join(cwd, ".opencode-remote", "config.json")
    await writeConfig(localConfigPath, {
      telegram: { botToken: "existing-token", allowedUserId: 321 },
      progressVerbosity: "all",
      logLevel: "debug",
    })
    const input = new PassThrough()
    const output = captureOutput()

    const prompt = promptForConfig(
      {
        localConfigPath,
        globalConfigPath: join(homeDir, ".opencode-remote", "config.json"),
      },
      { input, output },
    )
    await writeAnswers(input, ["", "", "", "", "", ""])
    const answers = await prompt

    expect(answers).toEqual({
      scope: "local",
      config: {
        telegram: { botToken: "existing-token", allowedUserId: 321 },
        progressVerbosity: "all",
        logLevel: "debug",
      },
    })
    expect(output.text()).toContain("Current config found")
    expect(output.text()).toContain("Telegram bot token (current: set; press Enter to keep)")
    expect(output.text()).toContain("Telegram allowed user ID (current: 321; press Enter to keep)")
  })

  test("uses existing global config values when global setup input is blank", async () => {
    const { cwd, homeDir } = await tempWorkspace()
    const globalConfigPath = join(homeDir, ".opencode-remote", "config.json")
    await writeConfig(globalConfigPath, {
      telegram: { botToken: "global-token", allowedUserId: 654 },
      progressVerbosity: "new",
      logLevel: "warn",
    })
    const input = new PassThrough()
    const output = captureOutput()

    const prompt = promptForConfig(
      {
        localConfigPath: join(cwd, ".opencode-remote", "config.json"),
        globalConfigPath,
      },
      { input, output },
    )
    await writeAnswers(input, ["global", "", "", "", "", ""])
    const answers = await prompt

    expect(answers).toEqual({
      scope: "global",
      config: {
        telegram: { botToken: "global-token", allowedUserId: 654 },
        progressVerbosity: "new",
        logLevel: "warn",
      },
    })
  })

  test("does not use global config values when local setup is selected", async () => {
    const { cwd, homeDir } = await tempWorkspace()
    await writeConfig(join(homeDir, ".opencode-remote", "config.json"), {
      telegram: { botToken: "global-token", allowedUserId: 654 },
      progressVerbosity: "new",
      logLevel: "warn",
    })
    const input = new PassThrough()
    const output = captureOutput()

    const prompt = promptForConfig(
      {
        localConfigPath: join(cwd, ".opencode-remote", "config.json"),
        globalConfigPath: join(homeDir, ".opencode-remote", "config.json"),
      },
      { input, output },
    )
    await writeAnswers(input, ["", "local-token", "111", "", "", ""])
    const answers = await prompt

    expect(answers.config.telegram).toEqual({ botToken: "local-token", allowedUserId: 111 })
    expect(output.text()).not.toContain("Current config found")
  })
```

- [ ] **Step 2: Run tests to verify failure**

Run: `pnpm vitest run tests/config/loadConfig.test.js`
Expected: FAIL because setup does not load selected-scope current values yet.

- [ ] **Step 3: Implement minimal setup defaults**

In `src/config/setupConfig.js`, import `readFileSync`, add a selected config loader, and use current values in prompt helpers. Keep this lookup synchronous so fast piped input is not dropped between readline questions:

```js
import { readFileSync } from "node:fs"
import { mkdir, writeFile } from "node:fs/promises"

function loadCurrentConfigForScope(paths, scope, cwd) {
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
  return loadConfigFromObject(raw, { configPath, cwd })
}

function formatCurrentHint(value, { secret = false } = {}) {
  if (value === undefined || value === null || value === "") {
    return ""
  }
  return ` (current: ${secret ? "set" : value}; press Enter to keep)`
}

async function askRequired(rl, label, currentValue, options = {}) {
  while (true) {
    const value = (await rl.question(`${label}${formatCurrentHint(currentValue, options)}: `)).trim()
    if (value) {
      return value
    }
    if (currentValue !== undefined && currentValue !== null && currentValue !== "") {
      return currentValue
    }
    rl.output.write(`${label} is required.\n`)
  }
}
```

Then pass `currentConfig?.telegram.botToken`, `currentConfig?.telegram.allowedUserId`, `currentConfig?.progressVerbosity`, `currentConfig?.logLevel`, and `currentConfig?.voice` into the existing prompts.

- [ ] **Step 4: Run focused config tests**

Run: `pnpm vitest run tests/config/loadConfig.test.js`
Expected: PASS.

### Task 2: Preserve current voice setup values

**Files:**
- Modify: `tests/config/loadConfig.test.js`
- Modify: `src/config/setupConfig.js`

- [ ] **Step 1: Write failing voice-default test**

Add under `describe("promptForConfig", ...)`:

```js
  test("uses existing voice config values when voice setup input is blank", async () => {
    const { cwd, homeDir } = await tempWorkspace()
    const localConfigPath = join(cwd, ".opencode-remote", "config.json")
    await writeConfig(localConfigPath, {
      telegram: { botToken: "token", allowedUserId: 123 },
      voice: {
        enabled: true,
        mode: "on",
        voice: "uk-UA-OstapNeural",
        groqApiKey: "existing-groq-key",
        sttModel: "whisper-large-v3-turbo",
      },
    })
    const input = new PassThrough()
    const output = captureOutput()

    const prompt = promptForConfig(
      {
        localConfigPath,
        globalConfigPath: join(homeDir, ".opencode-remote", "config.json"),
      },
      {
        input,
        output,
        checkFfmpeg: vi.fn(async () => ({ available: true })),
      },
    )
    await writeAnswers(input, ["", "", "", "", "", "yes", "", ""])
    const answers = await prompt

    expect(answers.config.voice).toEqual({
      enabled: true,
      mode: "on",
      groqApiKey: "existing-groq-key",
      voice: "uk-UA-OstapNeural",
    })
    expect(output.text()).toContain("Groq API key (current: set; press Enter to keep)")
    expect(output.text()).toContain("Edge TTS voice (current: uk-UA-OstapNeural; press Enter to keep)")
  })
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm vitest run tests/config/loadConfig.test.js`
Expected: FAIL if voice current values are not wired yet.

- [ ] **Step 3: Implement voice current values**

Pass `currentVoice` into `promptForVoiceConfig` and use:

```js
const groqApiKey = await askRequired(rl, "Groq API key", currentVoice?.groqApiKey, { secret: true })
const voice = await askRequired(rl, "Edge TTS voice", currentVoice?.voice ?? "en-US-AndrewNeural")
```

- [ ] **Step 4: Run focused config tests**

Run: `pnpm vitest run tests/config/loadConfig.test.js`
Expected: PASS.

### Task 3: Update public docs

**Files:**
- Modify: `README.md`
- Modify: `DEVELOPMENT.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Update README setup wording**

Replace the setup paragraph with wording that says selected-scope existing values are shown as current values and blank input keeps them.

- [ ] **Step 2: Update development note**

Change `pnpm setup` wording from simple replacement to rerunnable setup with current defaults.

- [ ] **Step 3: Update changelog**

Add an Unreleased Changed bullet:

```md
- Changed setup to reuse current values from the selected local or global config when prompts are left blank.
```

### Task 4: Verification

**Files:**
- No source files modified.

- [ ] **Step 1: Run focused tests**

Run: `pnpm vitest run tests/config/loadConfig.test.js`
Expected: PASS.

- [ ] **Step 2: Run normal verification**

Run: `pnpm run lint`
Expected: PASS.

Run: `pnpm test`
Expected: PASS.

Run: `pnpm run check`
Expected: PASS.

---

## Self-Review

- Spec coverage: selected local/global discovery, blank-to-keep behavior, secret masking, voice defaults, docs, and verification are all covered.
- Placeholder scan: no placeholder implementation tasks remain.
- Type consistency: tests use existing `promptForConfig`, `writeConfig`, `writeAnswers`, `captureOutput`, and Node stream helpers already present in `tests/config/loadConfig.test.js`.
