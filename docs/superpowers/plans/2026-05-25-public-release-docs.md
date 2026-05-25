# Public Release Docs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add public release documentation for current features and the first SemVer changelog entry.

**Architecture:** Keep `README.md` as the landing page, add `FEATURES.md` as the detailed public feature inventory, and add `CHANGELOG.md` as the SemVer release history. This is documentation-only and does not change runtime code.

**Tech Stack:** Markdown, existing Node.js project checks through pnpm/Biome/Vitest.

---

## File Structure

- Create `CHANGELOG.md`: public release history with a single `0.1.0` entry dated `2026-05-25`.
- Create `FEATURES.md`: public feature overview for the current text-first Telegram MVP.
- Modify `README.md`: keep concise feature bullets and add links to `FEATURES.md`, `CHANGELOG.md`, and `TODO.md`.
- No source or test files change.

## Task 1: Add Public Changelog

**Files:**
- Create: `CHANGELOG.md`

- [ ] **Step 1: Create `CHANGELOG.md`**

Add a Keep a Changelog-style file with this structure:

```md
# Changelog

This project follows Semantic Versioning.

## [0.1.0] - 2026-05-25

### Added

- Initial public text-first Telegram gateway for OpenCode.
- Telegram long polling with single-user allowlist.
- OpenCode server connection with optional local auto-start.
- OpenCode session creation, listing, selection, prompt sending, and stop requests.
- Telegram-safe response chunking, typing indicators, and bot command registration.
- Telegram emoji reaction support for processing indicators, user feedback, and assistant-requested reactions.
- Telegram photo and photo-album prompts.
- JSON settings persistence for selected session state.

### Known gaps

- Voice input and replies are not implemented yet.
- Model switching, permission callbacks, and multi-messenger adapters are not implemented yet.
- The package is not yet prepared as a public npm CLI package.
```

## Task 2: Add Public Feature Overview

**Files:**
- Create: `FEATURES.md`

- [ ] **Step 1: Create `FEATURES.md`**

Add a public feature inventory with these sections:

```md
# Features

OpenCode Remote is currently a text-first Telegram gateway for OpenCode.

## Available Now

...

## Telegram Chat Behavior

...

## OpenCode Sessions

...

## Media Prompts

...

## State And Security

...

## Not Available Yet

...
```

Keep wording factual, user-facing, and limited to behavior present in the current codebase.

## Task 3: Link Docs From README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update `Current Features`**

Keep the current concise feature list, add bullets for typing indicators and emoji reactions, and add a short paragraph linking to:

- `FEATURES.md`
- `CHANGELOG.md`
- `TODO.md`

## Task 4: Verify Docs

**Files:**
- Verify: `README.md`
- Verify: `FEATURES.md`
- Verify: `CHANGELOG.md`

- [ ] **Step 1: Run repository checks**

Run: `pnpm run check`

Expected: PASS, or a clear failure unrelated to the documentation edits that is reported in the final response.

- [ ] **Step 2: Review Markdown links**

Confirm the README links point to existing files: `FEATURES.md`, `CHANGELOG.md`, and `TODO.md`.

## Self-Review

The plan covers all approved documentation changes, contains no runtime scope, uses the existing package version `0.1.0`, and keeps user-facing docs separate from internal superpowers planning files.
