# Setup Choice List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render every interactive setup choice prompt as a vertical list that shows all options and highlights the active selection.

**Architecture:** Keep config setup owned by `src/config/setupConfig.js`. Change only the TTY choice renderer so typed, non-interactive input continues to use the current line-based fallback. Add focused tests around the choice renderer through `promptForConfig` using fake TTY streams.

**Tech Stack:** Node.js ESM, readline keypress events, Vitest, existing config setup helpers.

---

## Files

- Modify: `src/config/setupConfig.js`
- Modify: `tests/config/loadConfig.test.js`
- Maybe modify: `README.md`, `FEATURES.md`, `CHANGELOG.md` if wording needs to mention vertical list selection instead of generic arrow-key choices.

### Task 1: Add Interactive Choice Renderer Tests

**Files:**
- Modify: `tests/config/loadConfig.test.js`

- [ ] **Step 1: Add fake TTY stream helpers**

Add helpers near the existing `captureOutput` and `writeAnswers` helpers:

```js
function fakeTtyInput() {
  const input = new PassThrough()
  input.isTTY = true
  input.isRaw = false
  input.setRawMode = vi.fn((enabled) => {
    input.isRaw = enabled
  })
  return input
}

function fakeTtyOutput() {
  const output = captureOutput()
  output.isTTY = true
  return output
}

async function pressKey(input, sequence) {
  await new Promise((resolve) => setTimeout(resolve, 0))
  input.write(sequence)
}
```

- [ ] **Step 2: Add a failing test for vertical option rendering and selection**

Add this test to the `describe("promptForConfig", ...)` block:

```js
test("interactive choice prompts render all options and highlight the active option", async () => {
  const { cwd, homeDir } = await tempWorkspace()
  const input = fakeTtyInput()
  const output = fakeTtyOutput()

  const prompt = promptForConfig(
    {
      localConfigPath: join(cwd, ".opencode-remote", "config.json"),
      globalConfigPath: join(homeDir, ".opencode-remote", "config.json"),
    },
    { input, output },
  )

  await pressKey(input, "\x1b[B")
  await pressKey(input, "\r")
  await pressKey(input, "token\n")
  await pressKey(input, "123\n")
  await pressKey(input, "\x1b[A")
  await pressKey(input, "\r")
  await pressKey(input, "\r")

  const answers = await prompt

  expect(answers.scope).toBe("global")
  expect(answers.config.progressVerbosity).toBe("all")
  expect(answers.config.logLevel).toBe("info")
  expect(output.text()).toContain("Create config where?")
  expect(output.text()).toContain("local")
  expect(output.text()).toContain("global")
  expect(output.text()).toContain("Progress verbosity")
  expect(output.text()).toContain("off")
  expect(output.text()).toContain("new")
  expect(output.text()).toContain("all")
  expect(output.text()).toContain("verbose")
  expect(output.text()).toContain("\x1b[7m> global\x1b[0m")
  expect(output.text()).toContain("\x1b[7m> all\x1b[0m")
  expect(input.setRawMode).toHaveBeenCalledWith(true)
  expect(input.setRawMode).toHaveBeenCalledWith(false)
})
```

- [ ] **Step 3: Run focused config tests to verify failure**

Run: `pnpm vitest run tests/config/loadConfig.test.js`

Expected: new test fails because the current renderer writes only `Label: selected` and never renders all options.

### Task 2: Implement Vertical Highlighted Choice Rendering

**Files:**
- Modify: `src/config/setupConfig.js`

- [ ] **Step 1: Replace inline rendering with list rendering**

Change `askInteractiveChoice` so it clears the previously rendered prompt block, writes the label, writes every option, and highlights the selected option with ANSI inverse video:

```js
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
```

- [ ] **Step 2: Run focused tests**

Run: `pnpm vitest run tests/config/loadConfig.test.js`

Expected: config tests pass.

### Task 3: Update Docs If Needed And Verify

**Files:**
- Maybe modify: `README.md`
- Maybe modify: `FEATURES.md`
- Maybe modify: `CHANGELOG.md`

- [ ] **Step 1: Update public wording if it is more accurate**

If docs still say only generic arrow-key choices, update them to say setup choices show all options in a highlighted list. Keep wording short.

- [ ] **Step 2: Run normal verification**

Run: `pnpm run lint`

Expected: Biome check passes.

Run: `pnpm test`

Expected: Vitest suite passes.

Run: `pnpm run smoke:package`

Expected: package build and smoke check pass.

## Self-Review

- Spec coverage: the plan changes every interactive choice prompt because all setup choices call `askChoice`, which delegates to `askInteractiveChoice` for TTY streams.
- Non-TTY behavior: unchanged because fallback parsing in `askChoice` is not modified.
- Scope: no new dependency, no prompt library replacement, no config shape changes.
- Ambiguity: highlight means `>` plus ANSI inverse video for the active line.
