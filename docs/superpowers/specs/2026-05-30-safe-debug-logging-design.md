# Safe Debug Logging Design

## Goal

Add comprehensive, structured debug logging across OpenCode Remote so maintainers can diagnose routing, prompt delivery, runtime, media, voice, sticker, permission, and state issues without adding temporary instrumentation.

## Approach

Keep the existing `pino` logger and add targeted debug logs at current component boundaries. Do not introduce a new logging framework. Each log call must construct explicit safe metadata instead of passing raw Telegram, OpenCode, provider, filesystem, or config objects.

## Scope

- Runtime startup, shutdown, OpenCode server ownership, Telegram polling setup, and store lifecycle.
- Gateway controller session selection, prompt sending, permission decisions, and stop handling.
- Telegram ingress, group routing, prompt lifecycle, replies, media cleanup, and permission callbacks.
- Media, voice, and sticker download/render/transcribe/synthesize milestones.
- Project state database lifecycle.
- Public and contributor documentation for safe debug logging expectations.

## Privacy Rules

Logs must not include prompt text, Telegram message text, captions, voice transcripts, assistant reply text, raw provider responses, bot tokens, API keys, raw Telegram user IDs, raw chat IDs, raw file URLs, machine-specific file paths, or raw payload objects. Safe metadata may include booleans, counts, operation names, message kinds, chat types, sender kinds, MIME types, configured mode names, and scoped labels that do not reveal raw IDs.

## Testing

Add focused Vitest coverage for representative log payloads at each changed boundary. Tests should assert both useful fields and absence of sensitive fields for key paths.

## Documentation

Update `README.md` with how to enable debug logging and what it safely reports. Update `CONTRIBUTING.md` and `AGENTS.md` so new feature development includes safe structured logging when behavior has meaningful runtime decisions, external calls, cleanup, or failure modes.
