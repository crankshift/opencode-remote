# Bundled Guidance Skills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship sanitized OpenCode Remote guidance skills as package bundled skills.

**Architecture:** Keep development skills under `skills/development/` and add user-facing package copies under `bundled-skills/`. Verify the package includes the new files and docs describe them accurately.

**Tech Stack:** JavaScript ESM, Vitest, npm package smoke checks, Markdown skill files.

---

### Task 1: Test Bundled Guidance Skill Registration

**Files:**
- Modify: `tests/runtime/aiSkillRegistration.test.js`
- Modify: `tests/smoke/packageSmoke.js`

- [ ] **Step 1: Add tests that expect the four bundled guidance skills**

Add the new `bundled-skills/<name>/SKILL.md` paths to the bundled skill list. Split assertions so media skills keep media-marker checks while guidance skills assert OpenCode Remote content and no maintainer board workflow text.

- [ ] **Step 2: Run focused tests and verify they fail before files exist**

Run: `pnpm exec vitest run tests/runtime/aiSkillRegistration.test.js`

Expected: FAIL because at least one new bundled guidance `SKILL.md` file is missing.

### Task 2: Add Bundled Guidance Skill Files

**Files:**
- Create: `bundled-skills/opencode-remote-skill-creator/SKILL.md`
- Create: `bundled-skills/opencode-remote-troubleshooting/SKILL.md`
- Create: `bundled-skills/opencode-remote-gateway-capabilities/SKILL.md`
- Create: `bundled-skills/telegram-sticker-behavior/SKILL.md`

- [ ] **Step 1: Add sanitized user-facing skill copies**

Each skill must have valid frontmatter, a matching `name`, a trigger-focused `description`, privacy rules, and concise guidance. Remove maintainer-only language where the bundle is for installed users.

- [ ] **Step 2: Run focused tests and verify they pass**

Run: `pnpm exec vitest run tests/runtime/aiSkillRegistration.test.js`

Expected: PASS.

### Task 3: Update Docs And Release Metadata

**Files:**
- Modify: `README.md`
- Modify: `FEATURES.md`
- Modify: `CHANGELOG.md`
- Modify: `package.json`

- [ ] **Step 1: Document bundled OpenCode Remote guidance skills**

Update `/skills` docs to describe both media/design bundled skills and OpenCode Remote guidance skills.

- [ ] **Step 2: Bump package version and changelog**

Set the package version to the next patch release and add an Unreleased or release entry describing the bundled guidance skills.

### Task 4: Verify And Open PR

**Files:**
- No additional source files.

- [ ] **Step 1: Run verification**

Run: `pnpm run lint`, `pnpm test`, and `pnpm run check`.

- [ ] **Step 2: Commit and open PR**

Commit the intended changes, push the branch, and create a pull request for issue #40.
