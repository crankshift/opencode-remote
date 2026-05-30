---
name: concept-diagrams
description: Use when creating clean educational diagrams, process visuals, maps, cross-sections, or conceptual SVG-style graphics for OpenCode Remote media delivery.
license: MIT
compatibility: opencode
metadata:
  audience: users
  source: opencode-remote-bundled
---

# Concept Diagrams

Create clear visual explanations that can be exported to a Telegram-friendly media file.

## Visual Rules

- Prefer 2-3 semantic colors, not rainbow palettes.
- Use consistent spacing, stroke widths, and typography.
- Keep labels short and readable on mobile.
- Use color to encode meaning: neutral, success, warning, error, category.

## Output Contract

- Export the final deliverable to PNG, JPEG, WebP, or SVG only if the target can render it reliably.
- Prefer the OpenCode Remote disposable media cache when available: `<opencode-remote app-data>/cache/generated-media/`.
- Prefer PNG for OpenCode Remote delivery.
- Return the final file on its own line as `MEDIA:/absolute/path/to/file.png`.
- Do not return HTML-only output unless the user explicitly asked for an editable source file.

## Privacy

- Do not embed secrets, raw IDs, private paths, or raw logs in diagrams.
- Local file paths are allowed only in the `MEDIA:` marker needed for gateway delivery.
