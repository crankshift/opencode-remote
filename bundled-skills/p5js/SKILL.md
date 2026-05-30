---
name: p5js
description: Use when creating p5.js generative art, sketches, data visuals, canvas animations, or exported PNG/GIF/MP4 media for OpenCode Remote delivery.
license: MIT
compatibility: opencode
metadata:
  audience: users
  source: opencode-remote-bundled
---

# p5.js Visuals

Use p5.js when a user asks for generative art, interactive sketches, visualizations, shaders, or canvas animation.

## Creative Standard

- Start with a clear concept and visual direction before writing code.
- Avoid tutorial-looking defaults, flat white backgrounds, and generic particle effects.
- Use intentional color, composition, hierarchy, and motion.
- Prefer a cohesive aesthetic over a pile of unrelated effects.

## Output Contract

- Export a final PNG, GIF, MP4, WebM, or SVG file when the user wants media delivered in chat.
- Prefer the OpenCode Remote disposable media cache when available: `<opencode-remote app-data>/cache/generated-media/`.
- Prefer PNG for stills and MP4/WebM/GIF for animations.
- Return the final file on its own line as `MEDIA:/absolute/path/to/file.png`.
- If a browser-only interactive sketch is the true deliverable, provide the local HTML path separately and do not use `MEDIA:` unless an exported media file exists.

## Privacy

- Do not embed secrets, raw IDs, private paths, or raw logs in the canvas or response.
- Local file paths are allowed only in the `MEDIA:` marker needed for gateway delivery.
