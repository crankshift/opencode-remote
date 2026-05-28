# Telegram Group Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add DM-managed Telegram group routing so the gateway responds only when addressed, while keeping bounded recent group context for routed prompts.

**Architecture:** Keep Telegram-specific behavior inside `src/adapters/telegram/`. Add focused modules for group settings persistence, known group registry, routing decisions, in-memory context, and DM inline menus; keep `bot.js` as the orchestrator that delegates to those modules.

**Tech Stack:** Node.js ESM, grammY inline keyboards/callback queries, SQLite via `node:sqlite`, Vitest, Biome.

---

### Task 1: Routing And Memory Modules

**Files:**
- Create: `src/adapters/telegram/groupRouting.js`
- Create: `src/adapters/telegram/groupMemory.js`
- Test: `tests/adapters/telegramGroupRouting.test.js`
- Test: `tests/adapters/telegramGroupMemory.test.js`

- [ ] Write failing tests for sender policy, reply/mention/name-prefix triggers, own-bot ignore, topic/session memory keys, caps, per-message truncation, cursor overlap, and current-message exclusion.
- [ ] Run focused tests and confirm they fail because the modules do not exist.
- [ ] Implement pure routing helpers and in-memory rolling context with hard caps.
- [ ] Run focused tests and confirm they pass.

### Task 2: Persistent Group Store And Registry

**Files:**
- Create: `src/adapters/telegram/groupStore.js`
- Create: `src/adapters/telegram/groupRegistry.js`
- Test: `tests/adapters/telegramGroupStore.test.js`
- Test: `tests/adapters/telegramGroupRegistry.test.js`

- [ ] Write failing tests for persisted known groups, settings defaults, settings updates, reset, unavailable state, seeding from `allowedChatIds`, `getChat` refresh, and `my_chat_member` removal/addition.
- [ ] Run focused tests and confirm they fail because the modules do not exist.
- [ ] Implement SQLite-backed group store with an in-memory test store and registry helpers.
- [ ] Run focused tests and confirm they pass.

### Task 3: DM Group Menu

**Files:**
- Create: `src/adapters/telegram/groupMenu.js`
- Modify: `src/adapters/telegram/bot.js`
- Test: `tests/adapters/telegramGroupMenu.test.js`
- Test: `tests/adapters/telegramBot.test.js`

- [ ] Write failing tests for `/group` in DM, unauthorized DM rejection, group notice in groups, short callback tokens, callback user binding, selecting a group, toggling settings with buttons, clearing memory, and help/status rendering.
- [ ] Run focused tests and confirm they fail for missing behavior.
- [ ] Implement menu rendering and callback handlers, then wire `/group` into `bot.js`.
- [ ] Run focused tests and confirm they pass.

### Task 4: Bot Integration

**Files:**
- Modify: `src/adapters/telegram/bot.js`
- Modify: `src/runtime/bootstrap.js`
- Test: `tests/adapters/telegramBot.test.js`
- Test: `tests/runtime/bootstrap.test.js`

- [ ] Write failing integration tests for group passive memory, addressed text routing with eye reaction, sticker reply-to-bot routing with recent context, passive sticker metadata without downloads, voice transcript routing, reaction feedback gating, and memory reset on session create/select.
- [ ] Run focused tests and confirm they fail for missing behavior.
- [ ] Wire group routing before prompt sending, attach formatted context, remember bot replies, suppress group progress, gate group reactions, and include `my_chat_member` in `allowed_updates`.
- [ ] Run focused tests and confirm they pass.

### Task 5: Docs And Verification

**Files:**
- Modify: `src/core/commands/commands.js`
- Modify: `README.md`
- Modify: `FEATURES.md`
- Modify: `AGENTS.md` if durable architecture guidance changes

- [ ] Add `/group` to private command help and command registration behavior.
- [ ] Document DM-managed group settings, routing defaults, Telegram delivery requirements, ephemeral memory, voice transcription behavior, and sticker behavior.
- [ ] Run `pnpm run lint`, `pnpm test`, and `pnpm run check`.
