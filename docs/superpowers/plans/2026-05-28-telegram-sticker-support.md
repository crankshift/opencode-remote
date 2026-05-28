# Telegram Sticker Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Telegram sticker visual understanding, sticker preview caching, saved sticker pack management, and optional sticker replies for OpenCode reaction markers.

**Architecture:** Keep all Telegram sticker specifics inside `src/adapters/telegram`. OpenCode continues receiving messenger-neutral prompt objects with file attachments and text context. Static stickers are attached directly as WebP images, while video/animated stickers use cached preview images.

**Tech Stack:** Node.js ESM, grammY, SQLite via `node:sqlite`, `ffmpeg` through injectable process wrappers, optional python-lottie `lottie_convert.py`, Vitest, Biome.

---

## File Structure

- Create `src/adapters/telegram/stickerCache.js` for app-data sticker cache paths, cache validation, and cached file cleanup.
- Create `src/adapters/telegram/stickerStore.js` for SQLite-backed saved packs, seen stickers, and cached preview index records.
- Create `src/adapters/telegram/stickerRenderer.js` for static/video/animated representation helpers with injectable conversion functions.
- Create `src/adapters/telegram/stickers.js` for Telegram sticker download, prompt text formatting, and attachment orchestration.
- Modify `src/adapters/telegram/bot.js` for `/stickers`, save callbacks, `message:sticker`, and sticker-vs-emoji reply behavior.
- Modify `src/core/commands/commands.js` so command registration, help text, docs, and tests share `/stickers` from the central command source.
- Modify `src/runtime/bootstrap.js` to open/close the sticker store and pass sticker dependencies into the Telegram bot.
- Modify docs: `README.md`, `FEATURES.md`, and `DEVELOPMENT.md`.
- Add tests under `tests/adapters`, `tests/core`, and `tests/runtime`.

## Tasks

### Task 1: Sticker Command Definition

- [ ] Add a failing assertion in `tests/core/commands.test.js` that `/stickers` appears in command definitions and help text.
- [ ] Run `pnpm test tests/core/commands.test.js` and verify the new assertion fails because `/stickers` is missing.
- [ ] Add `/stickers` to `src/core/commands/commands.js` with description `Manage saved sticker packs`.
- [ ] Run `pnpm test tests/core/commands.test.js` and verify it passes.

### Task 2: Sticker Cache Helpers

- [ ] Add failing tests in `tests/adapters/telegramStickerCache.test.js` for default cache directory, cache record validation, missing-file invalidation, metadata mismatch invalidation, and cached file cleanup.
- [ ] Run `pnpm test tests/adapters/telegramStickerCache.test.js` and verify failures are for missing exports.
- [ ] Implement `src/adapters/telegram/stickerCache.js` with `STICKER_CONVERTER_VERSION`, `getStickerCacheDir`, `isStickerCacheRecordUsable`, `cachedStickerFilePath`, and `removeCachedStickerFiles`.
- [ ] Run `pnpm test tests/adapters/telegramStickerCache.test.js` and verify it passes.

### Task 3: Sticker Store

- [ ] Add failing tests in `tests/adapters/telegramStickerStore.test.js` for saved-pack upsert, list, forget, match-by-emoji selection, fallback selection, seen-sticker metadata, cache records, and no secret fields.
- [ ] Run `pnpm test tests/adapters/telegramStickerStore.test.js` and verify failures are for missing exports.
- [ ] Implement `src/adapters/telegram/stickerStore.js` with `openTelegramStickerStore` and `createMemoryStickerStore` for tests and dependency injection.
- [ ] Run `pnpm test tests/adapters/telegramStickerStore.test.js` and verify it passes.

### Task 4: Sticker Renderer And Prompt Attachments

- [ ] Add failing tests in `tests/adapters/telegramStickers.test.js` for static WebP direct attachment, cached preview reuse, cache mismatch regeneration, thumbnail fallback, metadata prompt text, and temp cleanup.
- [ ] Run `pnpm test tests/adapters/telegramStickers.test.js` and verify failures are for missing exports.
- [ ] Implement `src/adapters/telegram/stickerRenderer.js` with static direct representation and injectable video/animated preview generation.
- [ ] Implement `src/adapters/telegram/stickers.js` with `downloadTelegramSticker`, `createStickerPrompt`, `formatStickerPromptText`, and `saveStickerPackFromSet`.
- [ ] Run `pnpm test tests/adapters/telegramStickers.test.js` and verify it passes.

### Task 5: Telegram Bot Sticker Input And Commands

- [ ] Add failing tests in `tests/adapters/telegramBot.test.js` for handler registration, static sticker prompt delivery, inline save-pack button, `/stickers save`, `/stickers list`, and `/stickers forget <pack_name>`.
- [ ] Run `pnpm test tests/adapters/telegramBot.test.js` and verify failures are for missing sticker behavior.
- [ ] Modify `src/adapters/telegram/bot.js` to accept sticker dependencies, register `message:sticker`, register `/stickers`, tokenize save callbacks, and call sticker helper/store methods.
- [ ] Run `pnpm test tests/adapters/telegramBot.test.js` and verify it passes.

### Task 6: Sticker Replies For Reaction Markers

- [ ] Add failing tests in `tests/adapters/telegramBot.test.js` for randomized sticker-vs-emoji selection, emoji-matched sticker preference, fallback to emoji reaction on sticker send failure, and unchanged incoming eye reaction.
- [ ] Run `pnpm test tests/adapters/telegramBot.test.js` and verify failures are for missing reply selection behavior.
- [ ] Modify `src/adapters/telegram/bot.js` so parsed reaction markers use `maybeSendStickerReaction` after visible replies, with injectable randomness for deterministic tests.
- [ ] Run `pnpm test tests/adapters/telegramBot.test.js` and verify it passes.

### Task 7: Runtime Wiring

- [ ] Add failing tests in `tests/runtime/bootstrap.test.js` that runtime opens a sticker store, passes it to `createTelegramBot`, and closes it on shutdown.
- [ ] Run `pnpm test tests/runtime/bootstrap.test.js` and verify failures are for missing runtime wiring.
- [ ] Modify `src/runtime/bootstrap.js` to create the sticker store and close it during shutdown.
- [ ] Run `pnpm test tests/runtime/bootstrap.test.js` and verify it passes.

### Task 8: Docs

- [ ] Update `README.md` to document sticker messages, inline save, and `/stickers save|list|forget`.
- [ ] Update `FEATURES.md` to list shipped sticker support and app-data sticker cache behavior.
- [ ] Update `DEVELOPMENT.md` to document sticker cache/state paths and mocked tests.
- [ ] Run `pnpm run lint` to verify docs formatting.

### Task 9: Final Verification

- [ ] Run `pnpm test`.
- [ ] Run `pnpm run lint`.
- [ ] Run `pnpm run check`.
- [ ] Inspect `git status --short` and `git diff` for unintended files, secrets, raw Telegram payloads, bot tokens, user IDs, and local machine paths.

## Self-Review

This plan covers all issue 20 acceptance criteria: sticker visual attachments, static direct handling, animated/video preview caching, saved pack identifiers, unchanged eye reactions, randomized sticker replies, text-only permission prompts, Telegram adapter boundaries, and mocked default tests. It avoids speculative multi-user behavior and keeps sticker persistence non-secret.
