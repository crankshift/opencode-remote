# Contributing

Thanks for helping improve OpenCode Remote. This project is open source, so contribution notes, issues, pull requests, examples, and logs should be safe to publish.

## Good First Contributions

- Fix small bugs with clear reproduction steps.
- Improve public docs when behavior is unclear or incomplete.
- Add focused tests around existing behavior.
- Pick scoped items from `TODO.md` or propose a small issue before starting larger work.

Avoid large rewrites or broad feature branches without discussing the direction first. OpenCode Remote is intentionally narrow today: a local-first Telegram gateway for OpenCode.

## Before You Start

- Read `README.md` for user-facing behavior.
- Read `FEATURES.md` to confirm what is currently shipped.
- Read `TODO.md` for known roadmap items.
- Read `DEVELOPMENT.md` for local setup, commands, checks, app-state notes, and release details.

If you are changing architecture, OpenCode integration, Telegram behavior, config, state, or release packaging, mention that explicitly in the issue or pull request.

## Development Expectations

- Keep pull requests small and focused.
- Prefer the smallest correct change over speculative abstractions.
- Add or update tests for behavior changes.
- Update public docs when user-visible behavior changes.
- Keep command definitions centralized in `src/core/commands/commands.js`.
- Keep messenger-neutral logic out of Telegram adapter code and Telegram-specific UX out of core code.
- Do not add new runtime services, HTTP frameworks, adapters, or provider configuration unless the contribution is explicitly about that feature.

See `DEVELOPMENT.md` for install, run, lint, test, build, and package-check commands.

## Commit And Branch Naming

Use Conventional Commit messages. Common types for this repository are:

```text
feat: add a user-visible capability
fix: correct a bug
docs: update documentation only
test: add or update tests
chore: update maintenance tooling
ci: update GitHub Actions or release automation
refactor: restructure code without changing behavior
```

Use short branch names with the same kind of prefix:

```text
feat/telegram-voice-cache
fix/album-cleanup
docs/contributing-hooks
chore/update-tooling
```

Local Git hooks enforce linting and commit messages after dependencies are installed with `pnpm install`.

## Privacy And Security

Do not include secrets or private local details in issues, pull requests, tests, fixtures, screenshots, or logs.

Never publish:

- Telegram bot tokens.
- Telegram user IDs or chat IDs.
- Groq API keys or other credentials.
- Private config files.
- Raw provider responses that may include private data.
- Stack traces with sensitive context.
- Machine-specific local paths or usernames.

Use generic examples such as `/path/to/project`, `~/.opencode-remote/config.json`, `$XDG_DATA_HOME/opencode-remote`, or `%LOCALAPPDATA%\opencode-remote`.

## Optional Development Tools

Maintainers use the software-design plugin for structured design, review, and refactoring workflows:

https://github.com/crankshift/software-design

It is recommended if you plan to do ongoing development in this repository, especially larger design or refactoring work. It is not required for one-off contributions or pull requests.

This repository also ships AI-agent workflow skills for contributors:

- Canonical skills live in `skills/`.
- OpenCode reads `skills/` through `opencode.jsonc`.
- Claude Code plugin metadata lives in `.claude-plugin/plugin.json` and loads canonical skills from `skills/`.
- Codex-compatible plugin metadata lives in `.codex-plugin/plugin.json`, and `.agents/plugins/marketplace.json` points to this repository as a local plugin source.

These files are public repo configuration. They should not require maintainer-private home-directory config or board access.

## Pull Request Checklist

- The change is scoped to one bug, feature, or documentation improvement.
- The `package.json` version and `CHANGELOG.md` were updated so merging the pull request triggers the next release tag build.
- Tests were added or updated when behavior changed.
- Public docs were updated when user-visible behavior changed.
- `pnpm run lint`, `pnpm test`, or `pnpm run check` was run when practical.
- No secrets, private IDs, raw private logs, or machine-specific paths were included.
- The pull request explains the user impact and any tradeoffs.
