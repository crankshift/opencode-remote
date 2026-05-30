---
name: design-md
description: Use when authoring or validating DESIGN.md visual identity files, design tokens, or reusable style guidance for media generated through OpenCode Remote.
license: Apache-2.0
compatibility: opencode
metadata:
  audience: users
  source: opencode-remote-bundled
---

# DESIGN.md

Use DESIGN.md to capture reusable visual identity for future generated artifacts.

## Scope

- Define colors, typography, spacing, radius, components, motion, and rationale.
- Use exact token values so later image, diagram, web, or animation skills can stay consistent.
- Validate contrast and accessibility where possible.

## Output Contract

- DESIGN.md files are source artifacts, not chat media by themselves.
- Prefer the OpenCode Remote disposable media cache for exported visuals when available: `<opencode-remote app-data>/cache/generated-media/`.
- When a visual is exported from the design system, return the final export as `MEDIA:/absolute/path/to/file.png`.
- Do not use `MEDIA:` for the DESIGN.md source file unless the user explicitly asked for the raw file to be delivered as media.

## Privacy

- Do not encode secrets, raw IDs, private logs, or local-only operational details into design tokens.
- Local file paths are allowed only in the `MEDIA:` marker needed for gateway delivery.
