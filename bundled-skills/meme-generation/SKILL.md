---
name: meme-generation
description: Use when creating a real meme image file from a topic, template, screenshot, or short caption idea for delivery through OpenCode Remote.
license: MIT
compatibility: opencode
metadata:
  audience: users
  source: opencode-remote-bundled
---

# Meme Generation

Create an actual image file, then return it with the OpenCode Remote media marker.

## Output Contract

- Save the final meme as a local PNG, JPEG, or WebP file.
- Prefer the OpenCode Remote disposable media cache when available: `<opencode-remote app-data>/cache/generated-media/`.
- Return the media on its own line as `MEDIA:/absolute/path/to/file.png`.
- Do not wrap the marker in Markdown or quotes.
- Keep normal explanatory text separate from the marker.

## Workflow

1. Identify the joke structure: contrast, denial, impossible choice, escalation, or reversal.
2. Pick a template or create a simple composed image with readable text.
3. Keep captions short enough to read on a phone.
4. Verify the file exists and is non-empty.
5. Return `MEDIA:/absolute/path/to/file.png` so OpenCode Remote can deliver it.

## Privacy

- Do not include secrets, raw chat IDs, raw user IDs, provider keys, or private logs in the image or response.
- Local file paths are allowed only in the `MEDIA:` marker needed for gateway delivery.
