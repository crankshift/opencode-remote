---
name: opencode-remote-gateway-capabilities
description: Use when designing or changing opencode-remote gateway capabilities, Telegram behavior, voice replies, Activity messages, permission UI, reactions, stickers, or gateway-authored prompts.
license: MIT
compatibility: opencode
metadata:
  audience: maintainers
  source: opencode-remote
---

# opencode-remote-gateway-capabilities

Use this skill when designing, changing, or reviewing OpenCode Remote gateway behavior.

## Current Product Shape

OpenCode Remote is a local-first messenger gateway for OpenCode. Telegram is the only shipped adapter today. The gateway forwards authorized Telegram text, photo, sticker, and voice prompts to OpenCode sessions and returns OpenCode replies through Telegram.

## Boundary Rules

- Keep OpenCode/session orchestration messenger-neutral in `src/core/gateway/`.
- Keep OpenCode SDK and raw API access in `src/core/opencode/`.
- Keep Telegram chat IDs, message IDs, reactions, callbacks, media downloads, stickers, group routing, and grammY types in `src/adapters/telegram/`.
- Do not move Telegram-specific behavior into core services.
- Do not leak SDK-specific response shapes into adapters unless wrapped by core DTOs.

## Runtime Prompt Rules

Gateway-authored runtime prompts are protocol instructions when they describe hidden markers, runtime state, adapter context, or exact output constraints.

Keep these as code-owned prompt strings or prompt-builder modules:
- Telegram reaction marker instructions.
- Telegram sticker marker instructions.
- Reaction feedback prompts.
- Captionless image fallback prompts.
- Incoming sticker prompts.
- Sticker catalog description prompts.
- Group memory context wrappers.

Do not replace those deterministic strings with model-selected skills unless OpenCode later supports reliable gateway-controlled skill invocation.

## Capability Rules

For voice:
- Voice input is transcribed before OpenCode receives it.
- Voice replies are optional and configured by mode.
- Permission prompts remain text-only.

For Activity messages:
- Tool and skill usage can be shown separately in private chats.
- Final assistant replies should not include tool or skill usage announcements.

For permissions:
- Permission approvals must remain explicit.
- Never auto-approve OpenCode permissions by default.

For generated media:
- Do not claim image or GIF generation is shipped until the gateway implements a safe media-return contract.
- A future generated-media skill should describe when to create artifacts, where to write them, and how the gateway sends them back.

## Privacy Rules

- Never reveal or infer gateway secrets, bot tokens, provider API keys, raw IDs, private local configuration, private file paths, raw provider bodies, or raw Telegram payloads.
- Prefer safe structured diagnostics and sanitized user-facing errors.
