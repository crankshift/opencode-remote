# TODO

1. [ ] Split large source files into focused modules, not only `bot.js`.
   - Identify oversized files that mix unrelated responsibilities.
   - Start with `bot.js`, then apply the same approach to other large files.
   - Preserve existing behavior while extracting cohesive modules.
   - Add or update tests around moved behavior.

2. [x] Make the project a buildable/publishable CLI package for npm.
   - Add package metadata, `files`, `exports`, `prepack`, and package smoke checks.
   - Add README install/run docs for `npm install -g @crankshift/opencode-remote`, `pnpm add -g @crankshift/opencode-remote`, and `gateway run`.
   - Build publishable `dist/` output with `tsdown`.

3. [ ] Prefer absolute imports such as `@/core/...` instead of deep relative imports like `../../...`.
   - Configure runtime/package import aliases.
   - Configure Vitest/Biome support for the alias.
   - Update source and tests consistently.

4. [ ] Evaluate using `remeda` for runtime checks instead of raw manual checks.
   - Replace raw `typeof`, `Number.isInteger`, and similar checks where `remeda` improves clarity.
   - Do not replace checks where native JavaScript is clearer.

5. [ ] Expand bot command surface.
   - `/status` - Server health, current session, and model info.
   - `/new` - Create a new session.
   - `/abort` - Abort the current task.
   - `/detach` - Detach from the current session without stopping it.
   - `/sessions` - Browse and switch between recent sessions.
   - `/open` - Add a project by browsing directories.
   - `/ls` - List directory contents, then tap to open or download.
   - `/tts` - Toggle audio replies.
   - `/rename` - Rename the current session.
   - `/commands` - Browse and run custom commands.
   - `/skills` - Browse and run OpenCode skills.
   - `/mcps` - Browse and toggle MCP servers.
   - `/task` - Create a scheduled task.
   - `/tasklist` - Browse and delete scheduled tasks.
   - `/opencode_start` - Start the local OpenCode server on the bot machine.
   - `/opencode_stop` - Stop the local OpenCode server on the bot machine.
   - `/help` - Show available commands.

6. [ ] Change OpenCode startup behavior.
   - When `gateway run` starts and OpenCode is not running, prompt the CLI user before starting `opencode serve`.
   - Do not silently auto-start OpenCode by default.
   - Add a non-interactive flag or env option for explicit auto-start behavior.

7. [ ] Add modern Vitest coverage reporting.
   - Add `@vitest/coverage-v8` and a `pnpm run coverage` script using `vitest run --coverage`.
   - Configure V8 coverage for `src/**/*.js` with `text`, `html`, and `lcov` reporters.
   - Start with realistic global thresholds: 80% lines, statements, and functions; 70% branches.
   - Keep external Telegram, OpenCode, STT, and TTS systems mocked by default.
   - Add optional env-gated live smoke tests later instead of requiring live services in normal coverage runs.

8. [x] Add interactive JSON config discovery for the published npm CLI.
   - Replace `.env`-based runtime config with `.opencode-remote/config.json`.
   - Discover config in this order:
     1. Project-local `.opencode-remote/config.json` in the current working directory.
     2. Global `~/.opencode-remote/config.json`.
   - If no config exists, prompt the CLI user to create one.
   - Ask whether the config should be local or global before writing it.
   - Prompt for required values: Telegram bot token and Telegram allowed user ID.
   - Prompt or default optional values: OpenCode API URL, command, auto-start, workdir, progress verbosity, log level, and settings path.
   - Store gateway state under `.opencode-remote/` by default, separate from secrets when practical.
   - Validate `config.json` with zod and show safe, user-friendly errors.
   - Update README, FEATURES, `.env.example` removal/replacement, AGENTS.md, and tests.
   - Add tests for config precedence, missing-config setup flow, invalid JSON, validation errors, and no `.env` dependency.
