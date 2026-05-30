---
name: opencode-remote-troubleshooting
description: Use when diagnosing opencode-remote, Telegram bot, group routing, OpenCode startup, voice, sticker, ffmpeg, or safe debug log issues.
license: MIT
compatibility: opencode
metadata:
  audience: users-and-maintainers
  source: opencode-remote
---

# opencode-remote-troubleshooting

Use this skill to diagnose OpenCode Remote issues without exposing secrets or private local data.

## Privacy Rules

- Do not ask for Telegram bot tokens, Groq API keys, provider API keys, raw config files, or raw environment dumps.
- Do not ask for raw Telegram user IDs, chat IDs, message payloads, file IDs, or download URLs.
- Do not ask for absolute local paths from the user's machine.
- Prefer safe facts: command used, operating system family, config scope, enabled feature names, log level, message kind, chat type, booleans, counts, and sanitized error summaries.
- If logs are needed, ask for redacted excerpts that remove tokens, raw IDs, local paths, provider bodies, and private message text.

## Triage Order

1. Identify the feature area: startup, config, private chat, group routing, permissions, text/photo/sticker/voice prompts, reactions, or background runtime.
2. Check whether the issue is startup/config or prompt handling.
3. Ask for one safe observation at a time.
4. Prefer repository docs before guessing: `README.md`, `FEATURES.md`, `DEVELOPMENT.md`, `AGENTS.md`, and relevant tests.
5. If code investigation is needed, inspect source and tests before suggesting changes.

## Common Checks

For startup failures:
- Confirm Node.js is supported by the package.
- Confirm the command was run from the intended OpenCode project folder.
- Confirm the selected config scope is project-local or global.
- Confirm OpenCode is reachable or `opencode.autoStart` behavior is understood.

For Telegram private chats:
- Confirm `telegram.allowedUserIds` contains the authorized human user.
- Confirm the user is messaging the bot directly.
- Do not ask for the raw numeric ID unless the user chooses to share a redacted or test value.

For Telegram groups:
- Confirm `telegram.allowedChatIds` includes the group.
- Confirm the message addresses the bot under current group routing rules.
- Confirm BotFather privacy settings if the bot does not receive group messages.
- Confirm bot-to-bot mode if another bot should trigger context.

For voice:
- Confirm voice mode is enabled.
- Confirm `ffmpeg` is installed when runtime says conversion is unavailable.
- Confirm Groq key configuration only by asking whether it is set, not by requesting the value.

For stickers:
- Confirm the sticker type: static, video, or animated.
- Confirm whether the pack is saved when sticker replies are expected.
- Confirm converter availability for animated `.tgs` stickers if previews fail.

## Output Style

- Give short, ordered diagnostic steps.
- Separate safe checks from code changes.
- State when live Telegram, live OpenCode, Groq, Edge TTS, or `ffmpeg` are required.
- Avoid broad rewrites before reproducing or locating the failing boundary.
