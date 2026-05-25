# Changelog

This project follows Semantic Versioning.

## [0.1.0] - 2026-05-25

### Added

- Initial public text-first Telegram gateway for OpenCode.
- Telegram long polling with grammY and a single-user allowlist.
- OpenCode server connection with optional local `opencode serve` auto-start.
- OpenCode session creation, listing, selection, prompt sending, and stop requests.
- Telegram command registration for `/status`, `/new`, `/sessions`, `/stop`, and `/help`.
- Telegram-safe response chunking for long OpenCode replies.
- Typing indicators while OpenCode prompts are running.
- Telegram emoji reaction support for processing indicators, user feedback, and assistant-requested reactions.
- Telegram photo and photo-album prompts.
- JSON settings persistence for selected session state.

### Known Gaps

- Voice input and spoken replies are not implemented yet.
- Model switching, permission callbacks, and multi-messenger adapters are not implemented yet.
- The package is not yet prepared as a public npm CLI package.
