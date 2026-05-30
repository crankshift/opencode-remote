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

Trigger strongly for meme keyphrases: meme, memes, мем, мемасік, мемас, мемчик, мемчік. These are not the only triggers; use this skill whenever the user wants a real meme image.

Use Imgflip templates as the primary source. Fetch the popular template list or a specific Imgflip template image, choose the closest fit, and render locally.

Only use design or image-generation skills as fallback when Imgflip/template discovery fails or no suitable template exists. Do not use fallback design generation instead of an available meme template.

Use the exact render command from the current OpenCode Remote gateway instructions when rendering meme specs. Do not replace the render helper with custom curl, canvas, SVG, or image-generation scripts.

## Output Contract

- Save the final meme as a local PNG, JPEG, or WebP file.
- Prefer the exact generated-media directory from the current OpenCode Remote gateway instructions when present.
- If no generated-media directory was provided, use the OpenCode Remote disposable media cache when available: `<opencode-remote app-data>/cache/generated-media/`.
- Return the media on its own line as `MEDIA:/absolute/path/to/file.png`.
- Do not wrap the marker in Markdown or quotes.
- Keep normal explanatory text separate from the marker.

## Workflow

1. Identify the joke structure: contrast, denial, impossible choice, escalation, or reversal.
2. Fetch Imgflip templates first, such as `GET https://api.imgflip.com/get_memes`, or use an explicit Imgflip template URL when the user provides one.
3. Pick the closest matching Imgflip template and use its `url`, `width`, `height`, and `box_count` in the render spec.
4. Never call Imgflip `/caption_image` or any public meme creation endpoint.
5. Create a render spec JSON file with absolute `template.url` or allowed local `template.imagePath`, `outputPath`, and text boxes.
6. Render locally with the exact render command from the gateway instructions, replacing only `/absolute/path/to/spec.json` with the spec path.
7. If Imgflip/template discovery fails or no suitable template exists, then and only then use available design or image-generation skills to create fallback visual art under the generated-media directory.
8. If the exact render command fails, report the safe failure instead of inventing a separate renderer. Use fallback design/image-generation skills only for fallback visual art after template discovery fails.
9. Keep captions short enough to read on a phone.
10. Verify the file exists and is non-empty.
11. Return `MEDIA:/absolute/path/to/file.png` so OpenCode Remote can deliver it.

## Privacy

- Do not include secrets, raw chat IDs, raw user IDs, provider keys, or private logs in the image or response.
- Local file paths are allowed only in the `MEDIA:` marker needed for gateway delivery.
- Do not send private Telegram/user prompt text, chat excerpts, logs, IDs, or private project details as Imgflip or search query terms.
- Search only generic template names or themes, such as `drake`, `two buttons`, `distracted boyfriend`, or `change my mind`.
