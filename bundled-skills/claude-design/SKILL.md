---
name: claude-design
description: Use when designing one-off visual artifacts, prototypes, decks, landing pages, or polished HTML exports for OpenCode Remote media delivery.
license: MIT
compatibility: opencode
metadata:
  audience: users
  source: opencode-remote-bundled
---

# Claude Design

Design thoughtful one-off visual artifacts in a CLI/OpenCode environment.

## Design Rules

- Clarify the user goal, audience, tone, and constraints before producing visuals.
- Avoid generic AI-looking layouts and default palettes.
- Produce a specific visual language: typography, spacing, color, texture, and interaction behavior.
- Use `popular-web-designs` for known visual references and `design-md` for durable token specs.

## Output Contract

- If the deliverable is chat media, export it to PNG, JPEG, WebP, GIF, MP4, or WebM.
- Prefer the OpenCode Remote disposable media cache when available: `<opencode-remote app-data>/cache/generated-media/`.
- Return the final media file on its own line as `MEDIA:/absolute/path/to/file.png`.
- If the deliverable is editable HTML or a design spec, return the file path normally and use `MEDIA:` only for exported media.

## Privacy

- Do not include secrets, raw IDs, provider keys, raw logs, or private configuration in artifacts.
- Local file paths are allowed only in the `MEDIA:` marker needed for gateway delivery.
