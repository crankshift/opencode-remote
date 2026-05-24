# TODO

- [ ] Make the project a buildable/publishable CLI package for npm.
  - Add package metadata, `files`, `exports`, `prepack`, and package smoke checks.
  - Add README install/run docs for `pnpm add -g opencode-gateway` and `gateway run`.
  - Decide whether plain JS source publishing is enough or whether to add `dist/` via `tsup`/`esbuild`.

- [ ] Prefer absolute imports such as `@/core/...` instead of deep relative imports like `../../...`.
  - Configure runtime/package import aliases.
  - Configure Vitest/Biome support for the alias.
  - Update source and tests consistently.

- [ ] Evaluate using `remeda` for runtime checks instead of raw manual checks.
  - Replace raw `typeof`, `Number.isInteger`, and similar checks where `remeda` improves clarity.
  - Do not replace checks where native JavaScript is clearer.

- [ ] Expand bot command surface.
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

- [ ] Change OpenCode startup behavior.
  - When `gateway run` starts and OpenCode is not running, prompt the CLI user before starting `opencode serve`.
  - Do not silently auto-start OpenCode by default.
  - Add a non-interactive flag or env option for explicit auto-start behavior.
