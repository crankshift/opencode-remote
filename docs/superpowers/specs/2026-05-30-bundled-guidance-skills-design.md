# Bundled Guidance Skills Design

## Summary

OpenCode Remote should ship user-facing versions of four existing guidance skills: `opencode-remote-skill-creator`, `opencode-remote-troubleshooting`, `opencode-remote-gateway-capabilities`, and `telegram-sticker-behavior`.

## Approach

Add one bundled skill directory per guidance skill under `bundled-skills/`. Keep the development copies under `skills/development/` unchanged so repository contributors still get maintainer-oriented guidance through `opencode.jsonc`.

The bundled copies should be sanitized for installed users. They may mention OpenCode Remote runtime behavior, privacy boundaries, generated skills, troubleshooting, gateway capabilities, and sticker marker behavior. They must not include maintainer-only GitHub workflow, project board instructions, private local paths, raw IDs, tokens, logs, or repo-development-only assumptions.

## Package And Discovery

`package.json` already includes `bundled-skills/` in published package files. Tests should assert the new bundled skill files exist, have valid skill frontmatter, and are included by the package smoke check.

## Documentation

Update README and feature documentation to describe bundled OpenCode Remote guidance skills, not only media/design skills. Update changelog and package version before PR creation.

## Testing

Use TDD by first extending repository/package tests to expect the four bundled guidance skills. The failing tests should verify discovery/packaging behavior before the skill files are added.
