# Changelog

This project follows Semantic Versioning.

## Unreleased

## [0.4.0] - 2026-05-26

### Added

- Added opt-in Telegram voice mode with Groq Whisper transcription, Edge TTS speech generation, and `ffmpeg` OGG Opus conversion for Telegram voice notes.
- Added `/voice status|on|off|all|list|set|test`.
- Added `opencode-remote config set` for individual JSON config updates.
- Added `opencode-remote cache clear` for generated voice cache files.

### Changed

- Changed voice setup to offer automatic `ffmpeg` installation and wait for manual installation instead of discarding already entered setup answers.

## [0.3.2] - 2026-05-26

### Changed

- Changed interactive setup choices to show all options in a highlighted arrow-key list.
- Changed explicit setup to replace existing config without an extra overwrite prompt.
- Raised the pinned pnpm version to 11.3.0 so `pnpm setup` runs the project setup script.

## [0.3.1] - 2026-05-25

### Changed

- Moved runtime and app-state storage internals out of `README.md` and into `DEVELOPMENT.md`.

## [0.3.0] - 2026-05-25

### Added

- Added an OpenCode-style SQLite app-state database at the platform app-data location, with Git-aware project identity for active session and progress state.
- Added arrow-key selection for interactive setup choices.
- Added `--state-suffix` for isolated runtime state databases, and made `pnpm dev` use `opencode-remote-dev.db`.

### Changed

- Simplified interactive setup to ask only for config scope, Telegram credentials, progress verbosity, and log level.
- Changed the default progress verbosity to `verbose`.

## [0.2.0] - 2026-05-25

### Added

- Added `opencode-remote setup`, `opencode-remote start`, `opencode-remote stop`, and `opencode-remote status` CLI commands.
- Added background gateway PID and log management beside the selected config.
- Added `DEVELOPMENT.md` for source, test, build, and release workflow notes.

### Changed

- Changed the public package command surface to the single `opencode-remote` bin.
- Moved development and release instructions out of `README.md` so the README focuses on user install and usage.

### Removed

- Removed the legacy `gateway` package bin.

## [0.1.2] - 2026-05-25

### Added

- Added `tsdown` build output under `dist/` for the published npm CLI package.
- Added package smoke checks for bins, exports, and npm pack contents.
- Added a package smoke check that prevents relative README links from breaking on npm package pages.
- Added a tag-triggered GitHub Actions workflow for npm trusted publishing.
- Added GitHub repository metadata to the npm package manifest.
- Added a package smoke check that keeps the repository URL aligned with npm trusted publishing.
- Added interactive JSON config setup for the foreground CLI run command when no config exists.
- Added project-local and global `.opencode-remote/config.json` discovery.

### Changed

- Replaced `.env` runtime configuration with validated JSON config files.
- Changed default gateway state persistence to `.opencode-remote/settings.json` beside the selected config.
- Changed package repository metadata to npm's public GitHub `git+https` format for trusted publishing.
- Pinned the release workflow to a trusted-publishing-capable npm CLI before publishing.
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
