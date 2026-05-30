---
name: hyperframes
description: Use when creating HTML/CSS/JS motion graphics, title cards, or short rendered animations that should be delivered through OpenCode Remote.
license: Apache-2.0
compatibility: opencode
metadata:
  audience: users
  source: opencode-remote-bundled
---

# Hyperframes

Use HTML as the source for short motion graphics, then render a deliverable file for OpenCode Remote.

## Scope

- Good fit: short MP4/WebM animations, animated title cards, social overlays, captions, and deterministic motion graphics.
- Not a gateway dependency: rendering tools such as browsers or `ffmpeg` must already be available in the user's OpenCode environment.
- If rendering is not available, explain the blocker and offer a still image fallback.

## Output Contract

- Save the final animation as GIF, MP4, or WebM when possible.
- Prefer the OpenCode Remote disposable media cache when available: `<opencode-remote app-data>/cache/generated-media/`.
- Keep files small enough for messenger delivery; Telegram animations should stay under 50 MB.
- Return the final file on its own line as `MEDIA:/absolute/path/to/file.mp4`.
- Do not claim OpenCode Remote generated the animation; it only delivers the file.

## Privacy

- Do not embed secrets, raw IDs, private paths, or raw logs in generated video frames or captions.
- Local file paths are allowed only in the `MEDIA:` marker needed for gateway delivery.
