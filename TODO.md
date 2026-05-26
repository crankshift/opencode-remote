# TODO

1. [ ] Split large source files into focused modules, not only `bot.js`.
   - Identify oversized files that mix unrelated responsibilities.
   - Start with `bot.js`, then apply the same approach to other large files.
   - Preserve existing behavior while extracting cohesive modules.
   - Add or update tests around moved behavior.

2. [ ] Add a README section explaining why OpenCode Remote exists.
   - Compare it with richer remote-agent projects such as Hermes and OpenClaw.
   - Acknowledge that those tools may offer broader functionality, but emphasize the isolation tradeoff: agent-owned `.hermes/` or `.openclaw/` source/runtime folders can be changed by the agent and make updates more fragile.
   - Explain that OpenCode Remote is narrower today, with Telegram as the only messenger adapter, but keeps the gateway as an isolated CLI around a normal OpenCode project workflow.
   - Position the project as preserving the Claude Code, Codex CLI, and OpenCode style of working from a project folder while inheriting OpenCode global skills and project-local skills instead of shipping a noisy default skill set that pollutes context.

3. [x] Make the project a buildable/publishable CLI package for npm.
   - Add package metadata, `files`, `exports`, `prepack`, and package smoke checks.
   - Add README install/run docs for `npm install -g @crankshift/opencode-remote`, `pnpm add -g @crankshift/opencode-remote`, and `opencode-remote run`.
   - Build publishable `dist/` output with `tsdown`.

4. [ ] Prefer absolute imports such as `@/core/...` instead of deep relative imports like `../../...`.
   - Configure runtime/package import aliases.
   - Configure Vitest/Biome support for the alias.
   - Update source and tests consistently.

5. [ ] Evaluate using `remeda` for runtime checks instead of raw manual checks.
   - Replace raw `typeof`, `Number.isInteger`, and similar checks where `remeda` improves clarity.
   - Do not replace checks where native JavaScript is clearer.

6. [ ] Expand bot command surface.
   - `/status` - Server health, current session, and model info.
   - `/new` - Create a new session.
   - `/abort` - Abort the current task.
   - `/detach` - Detach from the current session without stopping it.
   - `/sessions` - Browse and switch between recent sessions.
   - `/open` - Add a project by browsing directories.
   - `/ls` - List directory contents, then tap to open or download.
    - `/voice` - Toggle and configure audio replies. (Implemented for Telegram voice mode.)
   - `/rename` - Rename the current session.
   - `/commands` - Browse and run custom commands.
   - `/skills` - Browse and run OpenCode skills.
   - `/mcps` - Browse and toggle MCP servers.
   - `/task` - Create a scheduled task.
   - `/tasklist` - Browse and delete scheduled tasks.
   - `/opencode_start` - Start the local OpenCode server on the bot machine.
   - `/opencode_stop` - Stop the local OpenCode server on the bot machine.
   - `/help` - Show available commands.

7. [ ] Investigate moving gateway-authored OpenCode prompts into bundled skills.
   - Inventory hardcoded prompts currently injected by the gateway, including Telegram reaction instructions, reaction feedback prompts, and image fallback prompts.
   - Evaluate whether these should stay adapter-owned strings or become built-in gateway skills invoked through OpenCode.
   - Preserve messenger-neutral core boundaries and avoid shipping a noisy default skill set unless the skills are isolated and clearly useful.
   - Document how Telegram-specific context would be passed without leaking Telegram concerns into core.

8. [ ] Change OpenCode startup behavior.
   - When `opencode-remote run` starts and OpenCode is not running, prompt the CLI user before starting `opencode serve`.
   - Do not silently auto-start OpenCode by default.
   - Add a non-interactive flag or env option for explicit auto-start behavior.

9. [ ] Add modern Vitest coverage reporting.
   - Add `@vitest/coverage-v8` and a `pnpm run coverage` script using `vitest run --coverage`.
   - Configure V8 coverage for `src/**/*.js` with `text`, `html`, and `lcov` reporters.
   - Start with realistic global thresholds: 80% lines, statements, and functions; 70% branches.
   - Keep external Telegram, OpenCode, STT, and TTS systems mocked by default.
   - Add optional env-gated live smoke tests later instead of requiring live services in normal coverage runs.

10. [x] Add interactive JSON config discovery for the published npm CLI.
   - Replace `.env`-based runtime config with `.opencode-remote/config.json`.
   - Discover config in this order:
     1. Project-local `.opencode-remote/config.json` in the current working directory.
     2. Global `~/.opencode-remote/config.json`.
   - If no config exists, prompt the CLI user to create one.
   - Ask whether the config should be local or global before writing it.
   - Prompt for required values: Telegram bot token and Telegram allowed user ID.
   - Prompt for progress verbosity and log level; keep OpenCode API URL, command, auto-start, and workdir on validated defaults unless users edit JSON.
   - Store gateway state in the platform app-data SQLite database, separate from secrets.
   - Validate `config.json` with zod and show safe, user-friendly errors.
   - Update README, FEATURES, `.env.example` removal/replacement, AGENTS.md, and tests.
   - Add tests for config precedence, missing-config setup flow, invalid JSON, validation errors, and no `.env` dependency.
