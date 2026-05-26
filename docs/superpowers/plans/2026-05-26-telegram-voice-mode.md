# Telegram Voice Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add opt-in Telegram voice input and voice replies backed by Groq Whisper, Edge TTS, and `ffmpeg` conversion.

**Architecture:** Keep voice orchestration in `src/core/voice`, Telegram file handling in `src/adapters/telegram`, and JSON config mutation in `src/config`. Voice is disabled by default and startup only requires `ffmpeg` when `voice.enabled=true`.

**Tech Stack:** Node.js ESM, grammY, Groq SDK, Edge TTS Universal, `ffmpeg`, Vitest, Biome.

---

## File Structure

- Create `src/config/writeConfig.js` for nested key mutation and safe JSON writes.
- Create `src/core/voice/cache.js` for app-data cache paths and clearing.
- Create `src/core/voice/audioConverter.js` for `ffmpeg` detection and MP3 to OGG Opus conversion.
- Create `src/core/voice/edgeTts.js` for Edge TTS voice listing and MP3 synthesis.
- Create `src/core/voice/groqTranscriber.js` for Groq Whisper transcription.
- Create `src/core/voice/voiceService.js` for mode rules and orchestration.
- Create `src/adapters/telegram/voice.js` for Telegram voice download and `sendVoice` helpers.
- Modify `src/config/loadConfig.js`, `src/config/setupConfig.js`, `src/bin/program.js`, `src/runtime/bootstrap.js`, `src/core/commands/commands.js`, and `src/adapters/telegram/bot.js`.
- Add or update tests under `tests/config`, `tests/bin`, `tests/core`, `tests/runtime`, and `tests/adapters`.

## Tasks

### Task 1: Voice Config And Config Writer

- [ ] Add failing tests in `tests/config/loadConfig.test.js` for default voice config and custom voice config.
- [ ] Add failing tests in `tests/config/writeConfig.test.js` for nested config key updates, boolean coercion, null values, and local/global path selection.
- [ ] Implement `voice` schema defaults in `src/config/loadConfig.js`.
- [ ] Implement `src/config/writeConfig.js` with `setConfigValue({ key, value, global, cwd, homeDir })`.
- [ ] Run `pnpm test tests/config/loadConfig.test.js tests/config/writeConfig.test.js`.

### Task 2: CLI Config Set And Cache Clear

- [ ] Add failing CLI tests in `tests/bin/gatewayProgram.test.js` for `config set voice.enabled true`, `config set voice.mode all -g`, and `cache clear`.
- [ ] Add `config set` and `cache clear` commands in `src/bin/program.js`.
- [ ] Run `pnpm test tests/bin/gatewayProgram.test.js`.

### Task 3: Voice Cache And Ffmpeg Wrapper

- [ ] Add failing tests for cache path/clear behavior in `tests/core/voiceCache.test.js`.
- [ ] Add failing tests for `ffmpeg` missing and conversion command shape in `tests/core/audioConverter.test.js`.
- [ ] Implement `src/core/voice/cache.js`.
- [ ] Implement `src/core/voice/audioConverter.js`.
- [ ] Run `pnpm test tests/core/voiceCache.test.js tests/core/audioConverter.test.js`.

### Task 4: Edge TTS And Groq Wrappers

- [ ] Add failing tests in `tests/core/edgeTts.test.js` for voice filtering, pagination, voice validation, and synthesis output.
- [ ] Add failing tests in `tests/core/groqTranscriber.test.js` for transcription request shape and missing key errors.
- [ ] Implement `src/core/voice/edgeTts.js`.
- [ ] Implement `src/core/voice/groqTranscriber.js`.
- [ ] Add `groq-sdk` and `edge-tts-universal` dependencies.
- [ ] Run `pnpm test tests/core/edgeTts.test.js tests/core/groqTranscriber.test.js`.

### Task 5: Voice Service

- [ ] Add failing tests in `tests/core/voiceService.test.js` for `off`, `on`, and `all` mode behavior.
- [ ] Implement `src/core/voice/voiceService.js` with narrow methods: `status`, `listVoices`, `setVoice`, `transcribe`, `shouldSpeak`, `synthesizeTelegramVoice`, and `clearCache`.
- [ ] Run `pnpm test tests/core/voiceService.test.js`.

### Task 6: Telegram Voice Helpers And Commands

- [ ] Add failing tests in `tests/adapters/telegramVoice.test.js` for voice download and `sendVoice`.
- [ ] Add failing tests in `tests/adapters/telegramBot.test.js` for `/voice` commands and `message:voice` flow.
- [ ] Implement `src/adapters/telegram/voice.js`.
- [ ] Wire `/voice` and `message:voice` in `src/adapters/telegram/bot.js`.
- [ ] Add `/voice` to `src/core/commands/commands.js`.
- [ ] Run `pnpm test tests/adapters/telegramVoice.test.js tests/adapters/telegramBot.test.js tests/core/commands.test.js`.

### Task 7: Runtime Wiring And Docs

- [ ] Add failing runtime tests in `tests/runtime/bootstrap.test.js` for voice service creation and enabled-voice `ffmpeg` startup check. Keep Telegram `allowed_updates` at `message`, because voice messages are message updates.
- [ ] Wire voice dependencies in `src/runtime/bootstrap.js`.
- [ ] Update `README.md`, `FEATURES.md`, `DEVELOPMENT.md`, `AGENTS.md`, `CHANGELOG.md`, and `TODO.md`.
- [ ] Run `pnpm test tests/runtime/bootstrap.test.js`.

### Task 8: Final Verification

- [ ] Run `pnpm run lint`.
- [ ] Run `pnpm test`.
- [ ] Run `pnpm run check`.
- [ ] Review `git diff` for unintended changes and secrets.

## Self-Review

This plan covers config persistence, CLI config mutation, cache clearing, `ffmpeg` checks, Groq STT, Edge TTS, voice mode rules, Telegram command handling, runtime wiring, and docs. No live network or paid-service calls are required in default tests.
