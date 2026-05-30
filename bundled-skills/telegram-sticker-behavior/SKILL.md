---
name: telegram-sticker-behavior
description: Use when working on Telegram sticker understanding, saved sticker packs, sticker catalogs, animated sticker previews, or hidden telegram_sticker markers in OpenCode Remote.
license: MIT
compatibility: opencode
metadata:
  audience: users
  source: opencode-remote
---

# telegram-sticker-behavior

Use this skill for OpenCode Remote sticker behavior design, debugging, and implementation.

## Current Behavior

- Incoming Telegram stickers are converted into OpenCode prompts with visual attachment context and safe metadata.
- Static stickers use WebP attachments.
- Video stickers use generated preview sheets.
- Animated `.tgs` stickers use `lottie_convert.py` when available and fall back safely when conversion is unavailable.
- Saved sticker packs allow OpenCode to request a sticker reply through hidden markers.
- Hidden markers are removed before the Telegram user sees the assistant reply.

## Marker Contract

The runtime marker contract remains adapter-owned code, not this skill.

Valid marker examples:
- `[telegram_sticker: any]`
- `[telegram_sticker: 😹]`
- `[telegram_sticker: laughing orange cat]`

Rules:
- Emit at most one sticker marker in a final answer.
- Use a sticker marker only when the user explicitly asks for a sticker or when the current feature flow allows sticker replacement.
- Do not show marker syntax to the end user in visible text.
- Do not invent Telegram file identifiers, pack internals, or download URLs.

## Privacy Rules

- Do not expose Telegram credentials, chat or user identifiers, file identifiers, download URLs, private cache paths, or Telegram payloads.
- Saved sticker descriptions should be short visual phrases, not private metadata.
- Cached sticker visuals are disposable implementation details.

## Implementation Boundaries

- Telegram sticker download, rendering, cache, saved-pack state, and marker parsing belong in Telegram adapter code.
- Messenger-neutral gateway code must not depend on Telegram sticker types.
- Runtime marker instructions should stay in adapter prompt-builder code because they depend on runtime state.
- This skill can guide design and maintenance, but it should not replace deterministic prompt strings.

## Testing Expectations

When changing sticker behavior:
- Update focused sticker tests.
- Verify static, video, animated, fallback, saved-pack, catalog, and marker-stripping behavior when affected.
- Keep default tests mocked; do not require live Telegram or network services.
