# Features

OpenCode Remote is currently a Telegram gateway for OpenCode with text, image, sticker, and opt-in voice support.

## Available Now

- Telegram private-chat and configured group gateway using grammY long polling.
- Optional authorized Telegram users for private-chat access configured in `.opencode-remote/config.json`.
- Optional allowed Telegram group chat IDs that authorize every sender in those groups, including other bots.
- Local or remote OpenCode server connection configured with `opencode.apiUrl`.
- Optional local OpenCode startup with `opencode.autoStart=true`.
- OpenCode session creation, listing, switching, prompt sending, and stop requests.
- OpenCode permission requests surfaced in Telegram with inline approve/deny buttons.
- Editable Telegram activity messages showing OpenCode tool and skill usage during prompts.
- Telegram-safe response chunking for long assistant replies.
- Published npm CLI package with the `opencode-remote` bin built to `dist/` with `tsdown`.
- Background gateway lifecycle commands: `opencode-remote start`, `opencode-remote stop`, and `opencode-remote status`.
- User-level login startup commands: `opencode-remote startup enable`, `opencode-remote startup disable`, and `opencode-remote startup status`.
- Interactive JSON config setup with project-local and global config discovery, selected-scope current defaults, highlighted arrow-key lists, and `ffmpeg` install/retry handling for voice setup.
- SQLite app-state persistence for selected OpenCode sessions and progress preferences, scoped by OpenCode project identity.
- Optional Telegram voice mode using Groq Whisper transcription, Edge TTS speech generation, and `ffmpeg` OGG Opus conversion.
- Telegram sticker understanding with static WebP sticker attachments, generated or fallback visual context for non-static stickers, saved sticker packs, and sticker replies.
- CLI config updates with `opencode-remote config set` and voice cache clearing with `opencode-remote cache clear`.

## Telegram Chat Behavior

- `/status` shows whether the gateway is running and which OpenCode session is active.
- `/new` creates and selects a new OpenCode session.
- `/sessions` lists recent OpenCode sessions and lets the user switch with inline buttons.
- `/stop` requests abort for the active OpenCode session.
- `/progress` shows or sets private-chat prompt activity visibility: `off`, `new`, `all`, or `verbose`.
- `/voice` shows and controls voice mode, lists voices by required short country/locale filter, sets the active Edge TTS voice, and sends a test voice note.
- `/stickers` saves, lists, and forgets sticker packs for future sticker replies.
- `/group` opens a private-chat management menu for known allowed groups. In groups, `/group` replies with a short DM-only notice.
- Per-group custom trigger phrases are managed from the DM `/group` menu.
- `/help` shows the available bot commands.
- The Telegram slash-command menu is refreshed on gateway startup.
- Non-command text from an authorized private user is sent to OpenCode as a prompt. In allowed groups, text, photo, voice, and sticker messages are sent to OpenCode only when group routing settings identify them as addressed to the bot.
- Custom group trigger phrases are plain text, case-insensitive, and match as bounded words or phrases anywhere in text, captions, and voice transcripts.
- Allowed groups keep bounded in-memory recent context while the gateway is running. Routed group prompts include capped recent context, but passive messages are not sent to OpenCode by themselves.
- Telegram text, photo, album, voice, and sticker prompts include safe author context, including forwarded original authors and messages sent by anonymous admins or on behalf of chats/channels when Telegram provides usable names.
- The bot shows Telegram typing activity while a prompt is running.
- In private chats, the bot can show an editable `Activity` message with OpenCode tools and skills used during a prompt. Group chats always suppress this activity message.
- OpenCode permission requests are sent as text with `Allow once`, `Always allow`, and `Deny` buttons, even when voice replies are enabled.
- Incoming text prompts get a temporary eye reaction while processing.
- OpenCode can request one Telegram emoji reaction by returning a hidden `[telegram_reaction: ...]` marker, which is removed before the user sees the reply.
- When saved sticker packs are available, eligible hidden reaction markers may be answered with a saved sticker reply instead of an emoji reaction.
- When saved sticker packs are available, explicit user requests for a sticker can be answered with a saved sticker reply through a hidden gateway marker.
- User emoji reactions to recent bot messages are sent back to OpenCode as feedback prompts.
- Telegram voice messages are transcribed and sent to OpenCode when voice mode is enabled.
- Voice replies replace text replies after voice prompts in `/voice on` mode and after text, photo, and voice prompts in `/voice all` mode, with text fallback if speech generation or sending fails.

## OpenCode Sessions

- If no active session is selected, the gateway creates one before sending a prompt.
- New sessions receive hidden gateway context with no assistant reply so OpenCode understands messenger, voice, activity, and permission behavior without showing a setup response to the user.
- Selected session state is stored in `opencode-remote.db` under the platform app-data directory and scoped by project identity.
- Stopping a task uses OpenCode's session abort API for the active session.
- Session state is messenger-neutral in the gateway core, so future adapters can reuse it.

## Media Prompts

- Telegram photo messages are downloaded temporarily and sent to OpenCode as file prompt parts.
- Telegram photo albums with a shared `media_group_id` are grouped into one OpenCode prompt.
- Album captions become the prompt text when present.
- Photos without captions use a default short reaction prompt.
- Temporary downloaded photo files are cleaned up after handling.
- Telegram sticker messages are sent to OpenCode with visual attachment context and safe sticker metadata.
- Static stickers use direct WebP image attachments. Video stickers use sampled preview sheets. Animated `.tgs` stickers use `lottie_convert.py` when available, with source-file fallback.
- Sticker visuals are cached under app-data cache storage and validated with `file_unique_id`, kind, dimensions, file size, and converter version.
- Cached sticker visuals can be summarized into short safe descriptions for the saved-sticker catalog used by future sticker replies.

## Voice Mode

- Voice mode is disabled by default.
- Groq Whisper uses `whisper-large-v3-turbo` by default for transcription.
- `/voice list <countryCode|locale> [page]` pages Edge TTS voices for a required country code such as `ua` or `us`, or a full locale such as `uk-UA`.
- Edge TTS voice short names such as `en-US-AndrewNeural` and `uk-UA-OstapNeural` can be selected with `/voice set`.
- `ffmpeg` is required only when voice mode is enabled.
- Generated MP3/OGG files are treated as disposable app-data cache.

## State And Security

- The bot ignores private Telegram users outside the configured user allowlist.
- The bot ignores group chats outside the configured chat allowlist. Allowed groups authorize all senders in that group, so configure only groups whose members and admins you trust.
- Group conversation memory is ephemeral, bounded, and cleared on gateway restart or OpenCode session changes. Persistent group state stores settings and known group metadata, not message text.
- Secrets are configured through private `.opencode-remote/config.json` files, not persisted settings.
- The selected active session is persisted as non-secret JSON state.
- Saved sticker packs persist only non-secret sticker identifiers and metadata.
- Telegram reaction API failures are best-effort warnings and do not block prompt delivery.
- Default tests mock Telegram and OpenCode; no live services are required for normal verification.

## Not Available Yet

- OpenCode model switching from Telegram.
- Signal or other messenger adapters.

See `TODO.md` for the current development roadmap.
