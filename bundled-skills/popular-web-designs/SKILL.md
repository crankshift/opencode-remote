---
name: popular-web-designs
description: Use when a user wants a generated visual, page, or artifact styled like a known product or established web design language for OpenCode Remote delivery.
license: MIT
compatibility: opencode
metadata:
  audience: users
  source: opencode-remote-bundled
---

# Popular Web Designs

Use established web visual languages as references for generated artifacts.

## Use When

- The user asks for a style like Stripe, Linear, Vercel, Notion, Airbnb, Apple, GitHub, or another recognizable product.
- A generated artifact needs a coherent palette, type scale, component style, and spacing system quickly.

## Rules

- Borrow visual language, not logos, trademarks, copyrighted copy, or misleading branding.
- Translate the style into original content that fits the user's request.
- Pair with `claude-design` for design process and with `design-md` for persistent tokens.

## Output Contract

- Export final chat-ready media to PNG, JPEG, WebP, GIF, MP4, or WebM.
- Prefer the OpenCode Remote disposable media cache when available: `<opencode-remote app-data>/cache/generated-media/`.
- Return the final file on its own line as `MEDIA:/absolute/path/to/file.png`.

## Privacy

- Do not embed secrets, raw IDs, private paths, or raw logs in generated visuals.
- Local file paths are allowed only in the `MEDIA:` marker needed for gateway delivery.
