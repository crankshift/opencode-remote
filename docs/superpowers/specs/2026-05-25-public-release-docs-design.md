# Public Release Docs Design

## Goal

Add public-facing documentation that explains what OpenCode Remote can do today and records the first SemVer release notes.

The docs should help prospective users quickly answer:

- What features are available now?
- What is included in the current public release?
- Where should users look from the README for feature details and release history?

## Audience

The primary audience is public users. The docs should be readable without knowing the internal implementation plan, test suite, or previous commit history.

Contributor details should stay minimal. Internal roadmap detail should remain in `TODO.md` instead of being duplicated in public release docs.

## Documentation Structure

Create three public entry points:

- `README.md`: project landing page, quick setup, command list, and links to detailed docs.
- `FEATURES.md`: detailed public feature inventory for the current text-first MVP.
- `CHANGELOG.md`: SemVer release history with one initial `0.1.0` entry.

`README.md` should keep a concise feature summary rather than becoming the full feature reference. It should link to both `FEATURES.md` and `CHANGELOG.md` near the current feature summary so users can discover them early.

## Features Document

`FEATURES.md` should describe available behavior, not planned architecture. It should cover:

- Telegram private-chat operation with grammY long polling.
- Single-user Telegram allowlist.
- OpenCode server connection and optional auto-start.
- Session creation, listing, switching, prompt sending, and stop requests.
- Telegram text prompt handling, safe chunking, typing indicator, and command replies.
- Telegram emoji reaction behavior.
- Telegram photo and photo-album prompts.
- JSON settings persistence for selected session state.
- Current boundaries and unavailable features, such as voice, model switching, permission callbacks, and multi-messenger adapters.

The unavailable features section should be factual and short, pointing to `TODO.md` for roadmap-level detail.

## Changelog

`CHANGELOG.md` should use a standard public release shape:

```md
# Changelog

This project follows Semantic Versioning.

## [0.1.0] - 2026-05-25
```

The first entry should summarize the current public baseline as one release, not reconstruct individual commits. Sections should use `Added` and `Known gaps` because this is the initial public release.

## README Changes

Update `README.md` so the existing `Current Features` section remains concise and links to:

- `FEATURES.md` for a complete feature overview.
- `CHANGELOG.md` for public release history.
- `TODO.md` for planned work.

The README command list and setup instructions should stay in place because they are still useful for first-time users.

## Testing And Verification

This is a documentation-only change. Run the repository's normal check command if available:

```bash
pnpm run check
```

If the full check fails because of existing non-doc issues, report the failure with the exact command and high-level reason. Do not claim the docs are complete without verifying the edited Markdown can be read and links point to existing files.

## Self-Review Notes

The design keeps public docs focused on user-visible behavior, avoids duplicating the internal `TODO.md`, uses the existing SemVer package version `0.1.0`, and adds no new runtime behavior or configuration.
