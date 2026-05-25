# Features

OpenCode Remote is currently a text-first Telegram gateway for OpenCode.

## Available Now

- Telegram private-chat gateway using grammY long polling.
- Single authorized Telegram user configured in `.opencode-remote/config.json`.
- Local or remote OpenCode server connection configured with `opencode.apiUrl`.
- Optional local OpenCode startup with `opencode.autoStart=true`.
- OpenCode session creation, listing, switching, prompt sending, and stop requests.
- Editable Telegram activity messages showing OpenCode tool and skill usage during prompts.
- Telegram-safe response chunking for long assistant replies.
- Published npm CLI package with the `opencode-remote` bin built to `dist/` with `tsdown`.
- Background gateway lifecycle commands: `opencode-remote start`, `opencode-remote stop`, and `opencode-remote status`.
- Interactive JSON config setup with project-local and global config discovery, plus arrow-key choices for setup options.
- SQLite app-state persistence for selected OpenCode sessions and progress preferences, scoped by OpenCode project identity.

## Telegram Chat Behavior

- `/status` shows whether the gateway is running and which OpenCode session is active.
- `/new` creates and selects a new OpenCode session.
- `/sessions` lists recent OpenCode sessions and lets the user switch with inline buttons.
- `/stop` requests abort for the active OpenCode session.
- `/progress` shows or sets prompt activity visibility: `off`, `new`, `all`, or `verbose`.
- `/help` shows the available bot commands.
- The Telegram slash-command menu is refreshed on gateway startup.
- Non-command text from the authorized user is sent to OpenCode as a prompt.
- The bot shows Telegram typing activity while a prompt is running.
- The bot can show an editable `Activity` message with OpenCode tools and skills used during a prompt.
- Incoming text prompts get a temporary eye reaction while processing.
- OpenCode can request one Telegram emoji reaction by returning a hidden `[telegram_reaction: ...]` marker, which is removed before the user sees the reply.
- User emoji reactions to recent bot messages are sent back to OpenCode as feedback prompts.

## OpenCode Sessions

- If no active session is selected, the gateway creates one before sending a prompt.
- Selected session state is stored in `opencode-remote.db` under the platform app-data directory and scoped by project identity.
- Stopping a task uses OpenCode's session abort API for the active session.
- Session state is messenger-neutral in the gateway core, so future adapters can reuse it.

## Media Prompts

- Telegram photo messages are downloaded temporarily and sent to OpenCode as file prompt parts.
- Telegram photo albums with a shared `media_group_id` are grouped into one OpenCode prompt.
- Album captions become the prompt text when present.
- Photos without captions use a default short reaction prompt.
- Temporary downloaded photo files are cleaned up after handling.

## State And Security

- The bot ignores Telegram users outside the configured allowlist.
- Secrets are configured through private `.opencode-remote/config.json` files, not persisted settings.
- The selected active session is persisted as non-secret JSON state.
- Telegram reaction API failures are best-effort warnings and do not block prompt delivery.
- Default tests mock Telegram and OpenCode; no live services are required for normal verification.

## Not Available Yet

- Voice input and spoken assistant replies.
- OpenCode model switching from Telegram.
- OpenCode permission approval callbacks.
- Signal or other messenger adapters.

See `TODO.md` for the current development roadmap.
