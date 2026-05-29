# Telegram Real Menu Callbacks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace dead-end Telegram menu buttons with real submenus, state changes, guided text input, or paginated selection flows while keeping direct slash commands working.

**Architecture:** Keep all Telegram menu behavior in `src/adapters/telegram/`. Use bounded in-memory token stores for pending voice filters and sticker pack selections. Extend existing `InlineKeyboard` usage instead of adding `@grammyjs/menu`.

**Tech Stack:** Node.js ESM, grammY `InlineKeyboard`, Vitest, Biome.

---

### Task 1: Voice Menu Callbacks

**Files:**
- Modify: `tests/adapters/telegramBot.test.js`
- Modify: `src/adapters/telegram/bot.js`

- [x] Write failing tests proving `/voice` menu buttons open real `Reply Format`, `Captions`, and `List Voices` flows.
- [x] Run `pnpm test tests/adapters/telegramBot.test.js` and confirm the tests fail because callbacks currently reply with usage text.
- [x] Implement `voice:mode`, `voice:captions`, `voice:list`, `voice_mode:*`, `voice_captions:*`, `voice_country:*`, `voice_countries:*`, `voice_page:*`, and `voice_select:*` callbacks.
- [x] Use generated paginated country buttons before showing paginated clickable voice buttons.
- [x] Run `pnpm test tests/adapters/telegramBot.test.js` and confirm it passes.

### Task 2: Sticker Menu Callbacks

**Files:**
- Modify: `tests/adapters/telegramBot.test.js`
- Modify: `src/adapters/telegram/bot.js`

- [x] Write failing tests proving `/stickers -> Saved Packs` opens pack buttons and pack buttons open a submenu with `Forget Pack` and `Back`.
- [x] Run `pnpm test tests/adapters/telegramBot.test.js` and confirm the tests fail because the callback currently returns a plain text list.
- [x] Implement bounded pack tokens and callbacks for `stickers:list`, `sticker_pack:*`, `sticker_forget:*`, and `stickers:menu`.
- [x] Keep `/stickers save`, `/stickers list`, and `/stickers forget <pack_name>` working.
- [x] Run `pnpm test tests/adapters/telegramBot.test.js` and confirm it passes.

### Task 3: Group Submenu Return Behavior

**Files:**
- Modify: `tests/adapters/telegramGroupMenu.test.js`
- Modify: `src/adapters/telegram/groupMenu.js`

- [x] Write failing tests proving trigger changes return to the trigger submenu and memory/context changes return to the memory submenu.
- [x] Run `pnpm test tests/adapters/telegramGroupMenu.test.js` and confirm the tests fail because changes return to the hub.
- [x] Update callbacks to re-render the active submenu after setting reply, trigger, memory, or context values.
- [x] Run `pnpm test tests/adapters/telegramGroupMenu.test.js` and confirm it passes.

### Task 4: Outcome-Based Labels

**Files:**
- Modify: `tests/adapters/telegramBot.test.js`
- Modify: `tests/adapters/telegramGroupMenu.test.js`
- Modify: `src/adapters/telegram/bot.js`
- Modify: `src/adapters/telegram/groupMenu.js`

- [x] Replace setting-name labels such as `Set Humans`, `Set Off`, and `Turn memory off` with labels that describe the user-visible outcome.
- [x] Update direct voice mode responses to use the same human wording as the menu.
- [x] Run focused Telegram menu tests and confirm they pass.

### Task 5: Docs And Verification

**Files:**
- Modify: `docs/adapters/telegram/commands/MENU.md`
- Modify: `README.md`
- Modify: `FEATURES.md`
- Modify: `AGENTS.md`
- Modify: `CHANGELOG.md`
- Modify: `package.json`

- [x] Update docs to say menu buttons must perform real actions or start guided input.
- [x] Update release metadata for the pull request.
- [x] Run `pnpm run lint`.
- [x] Run `pnpm test`.
- [x] Run `pnpm run check`.

---

Self-review: This plan covers the reported dead-end `/voice` buttons, upgrades sticker menu buttons, keeps direct commands, tightens group submenu behavior, and refines confusing menu labels. It intentionally does not add a full `/help` launcher redesign in this pass.
