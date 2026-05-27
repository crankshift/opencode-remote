# OpenCode Serve Port Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make auto-started OpenCode bind to the gateway's configured local API port and fail after a bounded 60-second wait if it never becomes reachable.

**Architecture:** Keep the behavior inside `src/core/opencode/serverManager.js`, because that module already owns OpenCode child-process startup and readiness polling. Parse `opencode.apiUrl` only for `localhost` and `127.0.0.1` hosts and pass `--port <port>` to `opencode serve`; leave remote-looking and IPv6 URLs unchanged so explicit user configuration remains authoritative. Bound each reachability check so a hung fetch cannot stall CLI startup forever.

**Tech Stack:** Node.js ESM, execa, Vitest, Biome.

---

### Task 1: Server Manager Startup Args And Timeout

**Files:**
- Modify: `tests/core/serverManager.test.js`
- Modify: `src/core/opencode/serverManager.js`
- Modify: `README.md`
- Modify: `DEVELOPMENT.md`

- [ ] **Step 1: Write failing tests for local port args and 60-second wait**

Add tests that expect `http://localhost:4096` to spawn `opencode serve --port 4096`, `http://127.0.0.1:7777` to spawn `opencode serve --port 7777`, remote and IPv6 URLs to keep `opencode serve`, and the default timeout configuration to represent 60 seconds.

- [ ] **Step 2: Run focused tests to verify they fail**

Run: `pnpm test tests/core/serverManager.test.js`

Expected: FAIL because `ensureOpenCodeServer()` still calls `processFactory(command, ["serve"], ...)` and defaults to a 15-second wait.

- [ ] **Step 3: Implement minimal startup-arg helper and timeout default**

In `src/core/opencode/serverManager.js`, change the default `maxAttempts` from `30` to `120` and use a small helper like:

```js
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
```

Then call `processFactory(command, buildServeArgs(apiUrl), ...)`.

- [ ] **Step 4: Run focused tests to verify they pass**

Run: `pnpm test tests/core/serverManager.test.js`

Expected: PASS.

- [ ] **Step 5: Update docs**

Update `README.md` to state that auto-start passes the configured local `opencode.apiUrl` port to `opencode serve` and exits with an error if OpenCode is not reachable after about 60 seconds.

Update `DEVELOPMENT.md` startup behavior with the same implementation-level note.

- [ ] **Step 6: Run normal verification**

Run: `pnpm run lint`, `pnpm test`, and `pnpm run check`.

Expected: all commands pass. Do not commit unless the user explicitly asks.

---

## Self-Review

- Spec coverage: covers issue 13 acceptance criteria for local auto-start port selection, explicit remote configuration preservation, timeout behavior, tests, and docs.
- Placeholder scan: no TBD/TODO placeholders remain.
- Type consistency: helper names and paths match the implementation target.
