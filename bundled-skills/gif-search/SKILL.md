---
name: gif-search
description: Use when finding or downloading an existing reaction GIF or short animation for delivery through OpenCode Remote.
license: MIT
compatibility: opencode
metadata:
  audience: users
  source: opencode-remote-bundled
---

# GIF Search

Find an existing GIF or animation when the user asks for a reaction GIF, meme GIF, or visual response.

## Rules

- Use only configured search/download tools and respect their credentials and rate limits.
- Prefer smaller GIF/MP4/WebM variants that fit messenger delivery.
- Telegram animations should stay under 50 MB.
- Do not use this when the user asked for an original generated animation; use a generation skill instead.

## Output Contract

- Save the selected GIF, MP4, or WebM locally.
- Prefer the OpenCode Remote disposable media cache when available: `<opencode-remote app-data>/cache/generated-media/`.
- Return it on its own line as `MEDIA:/absolute/path/to/file.gif`.
- Do not expose API keys, signed URLs, or raw provider response bodies.

## Privacy

- Do not include secrets, raw IDs, private paths, or raw logs in the response.
- Local file paths are allowed only in the `MEDIA:` marker needed for gateway delivery.
