---
name: comfyui
description: Use when running an existing ComfyUI image, video, or audio workflow whose outputs should be delivered through OpenCode Remote.
license: MIT
compatibility: opencode
metadata:
  audience: users
  source: opencode-remote-bundled
---

# ComfyUI

Use ComfyUI only when it is already configured or the user explicitly wants help setting it up.

## Scope

- Good fit: image generation, img2img, inpainting, upscaling, AnimateDiff, Wan/Hunyuan video workflows, and workflow parameter injection.
- Not a gateway dependency: OpenCode Remote does not install, run, or configure ComfyUI automatically.
- Ask before using paid cloud endpoints or long-running GPU jobs.

## Output Contract

- Download or save the final output as PNG, JPEG, WebP, GIF, MP4, or WebM.
- Prefer the OpenCode Remote disposable media cache when available: `<opencode-remote app-data>/cache/generated-media/`.
- Return the final media on its own line as `MEDIA:/absolute/path/to/file.png`.
- If generation fails, explain the safe error and do not fabricate a media marker.

## Privacy

- Never expose API keys, workflow secrets, raw prompts containing private data, or provider payloads.
- Local file paths are allowed only in the `MEDIA:` marker needed for gateway delivery.
