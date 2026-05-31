# Bundled Meme Skill Runtime Assets Design

## Summary

OpenCode Remote will ship a bundled meme-generation skill and make it explicitly enableable for the current project. The goal is for Telegram users to ask for a meme, have the active OpenCode session use the project-local skill when appropriate, and receive a private locally rendered image without publishing anything through Imgflip.

This design is tracked by GitHub issue #43.

## Current State

OpenCode Remote currently ships `bundled-skills/` and lists those skills in the Telegram `/skills` menu through `src/core/opencode/skillDiscovery.js`. That discovery is local to OpenCode Remote. It does not by itself make the bundled skills visible to the running OpenCode server.

OpenCode discovers custom runtime assets from OpenCode configuration locations, including project-local `.opencode/agent/*.md`, `.opencode/agents/*.md`, `.opencode/skills/**/SKILL.md`, and `.opencode/skill/**/SKILL.md`. OpenCode Remote should therefore sync bundled assets into project-local OpenCode paths when users enable them.

## Goals

- Ship a bundled `meme-generation` OpenCode skill with OpenCode Remote.
- Make the bundled OpenCode Remote meme skill visible to OpenCode sessions through a project-local enable/sync flow.
- Add a safe generated-media return contract so OpenCode responses can attach local generated files to Telegram replies.
- Avoid writing to global OpenCode config or global agent/skill directories by default.
- Keep Telegram prompts on the active OpenCode session; OpenCode decides whether to use the meme skill.
- Render memes locally and return them with a `MEDIA:/absolute/path/to/file` delivery contract.
- Use Imgflip only for template discovery and template image fetching, never for public meme creation.

## Non-Goals

- Do not create public memes through Imgflip `/caption_image` or any equivalent hosted creation endpoint.
- Do not require Imgflip credentials or Premium API access.
- Do not globally install the meme skill for every project.
- Do not add a broad multi-agent management system beyond what this task needs.
- Do not persist Telegram IDs, bot tokens, private prompts, or raw provider payloads in synced assets.

## Runtime Asset Model

OpenCode Remote package assets remain canonical in the repository and package:

- `bundled-skills/meme-generation/SKILL.md`

When the gateway starts for a project, OpenCode Remote syncs bundled skills into namespaced project-local OpenCode locations. If the project OpenCode config has a project-local `skills.paths` entry, the first such directory is used. Otherwise the default project skill directory is used:

- `<configured-skills-path>/opencode-remote-bundled/<skill-name>/SKILL.md`
- `.opencode/skills/opencode-remote-bundled/<skill-name>/SKILL.md`

The sync is automatic and project-local, not a global OpenCode config mutation. Gateway startup installs or updates bundled skills before ensuring the OpenCode server so auto-started servers can discover them. Telegram `/skills` refresh also re-runs the sync. There is no separate `Enable meme skill` action. The sync also removes the legacy experimental `.opencode/agent/opencode-remote-meme.md` path if present. A separate CLI command is deferred.

If OpenCode was already running before the gateway and does not discover newly installed skills immediately, the user may need to restart OpenCode.

The synced files are generated from package assets and should be easy to identify. A disable/remove command is deferred for the first implementation; users can delete the namespaced project-local files manually if needed.

## Generated Media Contract

OpenCode Remote will parse generated media markers in assistant responses. A marker is a line containing `MEDIA:/absolute/path/to/file`. The gateway should remove marker lines from visible text and send the referenced local file through Telegram only when the file is inside the gateway generated-media directory or an injected allowlist, exists, is readable, is non-empty, and has PNG, JPEG, or WebP image content verified by magic bytes.

If a marker references a missing, unreadable, empty, or unsupported file, the gateway should not expose the raw path to the user. It should send the remaining text if present and include a safe failure message when no usable media can be sent.

The contract is local-filesystem based. If a user connects OpenCode Remote to an OpenCode server on another machine, generated media delivery only works for paths readable by the gateway process.

## Telegram Invocation Flow

OpenCode Remote installs the project-local bundled meme skill so the active OpenCode session can discover and choose it when appropriate.

Telegram should not force meme-like prompts to a specific OpenCode workflow. The gateway should send normal prompt parts, media attachments, author context, progress handling, permission handling, and response delivery through the active session unchanged.

If a user asks for a meme before OpenCode discovers the project-local skill, OpenCode may still respond normally. The gateway should not block the prompt with an enable message; startup and `/skills` refresh are responsible for keeping bundled runtime assets installed.

## Meme Skill Responsibilities

The bundled meme skill is responsible for producing a real local image file and returning the media marker.

The skill should use Imgflip templates as the primary path. It may use available design or image-generation skills only as fallback when Imgflip/template discovery fails or no suitable template exists. Fallback design generation must not replace an available meme template.

Workflow:

1. Understand the requested joke structure, template preference, and audience context.
2. Find candidate Imgflip templates.
3. Choose concise meme text.
4. Place text in suitable template boxes using the selected template URL or an explicitly allowed local template image.
5. Render the image locally.
6. Verify the output file exists and is non-empty.
7. Return `MEDIA:/absolute/path/to/file.png` on its own line.

The skill must not include secrets, raw Telegram IDs, raw user IDs, provider keys, private logs, or private local configuration in the image or user-facing response.

Rendering should use a code-owned OpenCode Remote helper rather than asking the model to hand-roll image processing each time. The skill should decide the template, text, and boxes, then call the helper with a structured render specification. The helper should download or read the template image, render text locally, write to the generated-media cache, verify the output, and print the final `MEDIA:` marker. This keeps creative placement model-guided while keeping file generation deterministic and testable.

## Imgflip Template Discovery

The primary source is `GET https://api.imgflip.com/get_memes`. This returns popular templates with `id`, `name`, `url`, `width`, `height`, and `box_count`. The response order and size can change, so the agent should treat it as a live candidate list rather than a stable catalog.

For template search beyond the popular list, the fallback is webfetch of Imgflip search pages such as `https://imgflip.com/memesearch?q=drake`. The agent can parse returned page content for template names, template pages, and image URLs. It should prefer blank/template images over already-captioned examples.

The Premium `POST /search_memes` endpoint is out of scope because this feature should not require Imgflip credentials. The `/caption_image` endpoint is forbidden because it creates publicly accessible hosted memes.

## Text Placement Strategy

Text placement uses a hybrid strategy.

Known popular templates use curated boxes. The initial curated set should cover common high-value templates such as Drake Hotline Bling, Two Buttons, Distracted Boyfriend, Change My Mind, Expanding Brain, Woman Yelling At Cat, One Does Not Simply, and similar top templates if present in the fetched catalog.

Unknown templates use fallback inference from:

- Imgflip `box_count`
- image width and height
- template name and common meme structure
- visual inspection when the active model can reason over the downloaded image
- safe heuristics such as top/bottom boxes for classic image macros and right-side boxes for obvious panel templates

The renderer should wrap text, reduce font size to fit, keep captions phone-readable, and avoid covering faces or important visual content where possible. Default text style should be white Impact-like text with a black outline, with dark text allowed for light caption panels.

## Rendering And Cache

The generated image should be written to the disposable generated-media cache when available: `<opencode-remote app-data>/cache/generated-media/`. The final path must be absolute because the gateway media marker contract requires `MEDIA:/absolute/path/to/file`.

The implementation should use the code-owned OpenCode Remote render helper described above. No generated meme image should be uploaded to Imgflip or another hosted service as part of normal operation.

## Error Handling

- If Imgflip API fetching fails, fall back to webfetch search for Imgflip template pages.
- If template discovery fails or no suitable template exists, use available design or image-generation skills as fallback, or explain that no suitable template could be found.
- If rendering fails, return a safe text error instead of a broken `MEDIA:` marker.
- If the output file is missing or empty, treat generation as failed and do not return it.
- User-facing errors must not include stack traces, tokens, private paths except the required final `MEDIA:` marker, raw provider bodies, or raw Telegram payloads.

## Testing

Tests should cover:

- bundled skill package registration and smoke packaging
- generated media marker parsing and Telegram media delivery behavior
- project-local runtime asset sync paths and file contents
- no default global OpenCode config writes
- meme-like Telegram prompts continuing through the active OpenCode session without forced `agent` selection
- non-meme prompts continuing through default routing
- `/skills` enablement behavior for project-local bundled assets
- docs or package smoke checks for the bundled skill asset

Network calls to Imgflip should not be required for default tests. Tests should mock API/search results and rendering behavior.

## Documentation

Public docs should explain:

- bundled meme generation is project-local and opt-in
- how to enable the bundled meme skill for the current project
- where synced files are written
- OpenCode may need restart to discover newly synced skills
- Imgflip is used only for template discovery/fetching, not public meme creation

## Deferred Work

- Add a CLI command for enabling bundled runtime assets outside Telegram.
- Add a disable/remove action for namespaced project-local bundled assets.
