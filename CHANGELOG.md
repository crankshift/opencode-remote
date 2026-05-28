# Changelog

This project follows Semantic Versioning.

## Unreleased

## [0.6.1] - 2026-05-28

### Fixed

- Fixed Telegram prompt author context for messages sent by anonymous admins or on behalf of chats/channels by using Telegram `sender_chat` names when available.

## [0.6.0] - 2026-05-28

### Added

- Added Telegram sticker understanding with static sticker attachments, generated visual previews for video and animated stickers, reusable sticker visual caching, and saved sticker pack management. (#20)
- Added saved sticker replies for explicit sticker requests and eligible reaction markers, including a safe description catalog built from cached sticker visuals. (#20)

### Removed

- Removed Dependabot configuration to stop automated dependency update pull requests.

## [0.5.7] - 2026-05-28

### Fixed

- Fixed forwarded Telegram messages to include safe original author context in OpenCode prompts, falling back to the authorized Telegram user when forwarded author data is unavailable. (#19)

## [0.5.6] - 2026-05-27

### Added

- Added a pull request and `main` branch `Check` workflow plus workflow smoke checks for CI/CD guardrails.
- Added Dependabot maintenance for GitHub Actions and npm dependencies.
- Added automatic `vX.Y.Z` tag creation after successful `Check` runs on pushed `main` commits, then dispatching npm publishing at the created tag ref.

### Changed

- Changed npm publishing to run only from `vX.Y.Z` tags after the release check job succeeds, with provenance enabled.

### Fixed

- Fixed release tag creation to fail with a version-bump message when the package version tag already exists at a different commit.

## [0.5.5] - 2026-05-27

### Changed

- Changed npm publishing to run only after commits land on `main`, including pull request merges, instead of manual dispatches or version tag pushes.

## [0.5.4] - 2026-05-27

### Added

- Added hidden gateway context for new OpenCode sessions so agents understand messenger, voice, activity, and permission behavior without showing a setup response to the user.

## [0.5.3] - 2026-05-26

### Added

- Added user-level login startup setup and `opencode-remote startup enable|disable|status` commands for project-folder scoped gateway autostart.

## [0.5.2] - 2026-05-26

### Fixed

- Fixed Debian/Fedora `ffmpeg` auto-install commands to use non-interactive package-manager confirmation flags.

## [0.5.1] - 2026-05-26

### Changed

- Changed `/voice list` short-code filtering to prefer Edge TTS country/region codes such as `ua` and to accept full locales such as `uk-UA`.

## [0.5.0] - 2026-05-26

### Added

- Added Telegram approval buttons for OpenCode permission requests, with text-only permission prompts in voice modes.

## [0.4.3] - 2026-05-26

### Changed

- Changed successful Telegram voice replies to be voice-only in `/voice on` and `/voice all`, with text fallback when voice generation or sending fails.

## [0.4.2] - 2026-05-26

### Changed

- Changed `/voice list` to require a short country or language code and accept only an optional page argument.

## [0.4.1] - 2026-05-26

### Changed

- Changed setup to reuse current values from the selected local or global config when prompts are left blank.

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
