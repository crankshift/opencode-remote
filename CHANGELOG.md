# Changelog

This project follows Semantic Versioning.

## Unreleased

## [0.1.1] - 2026-05-25

### Added

- Added `tsdown` build output under `dist/` for the published npm CLI package.
- Added package smoke checks for bins, exports, and npm pack contents.
- Added a package smoke check that prevents relative README links from breaking on npm package pages.
- Added a tag-triggered GitHub Actions workflow for npm trusted publishing.
- Added GitHub repository metadata to the npm package manifest.
- Added interactive JSON config setup for `gateway run` when no config exists.
- Added project-local and global `.opencode-remote/config.json` discovery.

### Changed

- Replaced `.env` runtime configuration with validated JSON config files.
- Changed default gateway state persistence to `.opencode-remote/settings.json` beside the selected config.
- Updated package bins and exports to point at built `dist/` output.
- Raised the Node.js engine requirement to `>=22.18.0`.

### Fixed

- Replaced relative README links to `FEATURES.md`, `CHANGELOG.md`, and `TODO.md` with absolute GitHub links so they open correctly from npm.

## [0.1.0] - 2026-05-25

### Added

- Initial public text-first Telegram gateway for OpenCode.
- Telegram long polling with grammY and a single-user allowlist.
- OpenCode server connection with optional local `opencode serve` auto-start.
- OpenCode session creation, listing, selection, prompt sending, and stop requests.
- Telegram command registration for `/status`, `/new`, `/sessions`, `/stop`, `/progress`, and `/help`, refreshed on startup for default and private chats.
- Telegram-safe response chunking for long OpenCode replies.
- Typing indicators while OpenCode prompts are running.
- Telegram emoji reaction support for processing indicators, user feedback, and assistant-requested reactions.
- Telegram photo and photo-album prompts.
- Editable Telegram activity messages for OpenCode tool and skill usage, configurable with `/progress`.
- JSON settings persistence for selected session state.

### Known Gaps

- Voice input and spoken replies are not implemented yet.
- Model switching, permission callbacks, and multi-messenger adapters are not implemented yet.
