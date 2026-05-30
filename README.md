# OpenCode Remote

OpenCode Remote lets you use OpenCode from Telegram. It runs on your machine, connects to your local or remote OpenCode server, and forwards messages from authorized private users or allowed Telegram groups to OpenCode sessions.

This is a Telegram MVP with text prompts, photo prompts, sticker prompts/replies, OpenCode permission approvals, and opt-in voice input/replies. Model switching and multi-messenger support are not implemented yet.

See [Features](https://github.com/crankshift/opencode-remote/blob/main/FEATURES.md) for the full current capability list, [Contributing](https://github.com/crankshift/opencode-remote/blob/main/CONTRIBUTING.md) for contribution guidance, [Changelog](https://github.com/crankshift/opencode-remote/blob/main/CHANGELOG.md) for release notes, and [TODO](https://github.com/crankshift/opencode-remote/blob/main/TODO.md) for planned work.

## Prerequisites

- Node.js 22.18.0 or newer. Node.js 24 LTS is recommended.
- OpenCode CLI available on the machine running the gateway.
- A Telegram bot token from BotFather.
- One or more Telegram numeric user IDs for private-chat access, or one or more Telegram group chat IDs for group access.
- Optional voice mode: a free Groq API key for Whisper transcription and `ffmpeg` installed locally for Telegram voice-note conversion.

## Install

Install globally with npm:

```bash
npm install -g @crankshift/opencode-remote
```

Or with pnpm:

```bash
pnpm add -g @crankshift/opencode-remote
```

The package installs the `opencode-remote` command.

After installing, run `opencode-remote` from the OpenCode project folder you want to control. The gateway uses that folder as the default OpenCode workdir and as the project identity for persisted session state.

## Setup

Open your project folder first:

```bash
cd /path/to/your/project
```

Create the config interactively:

```bash
opencode-remote setup
```

The setup flow asks whether to write a project-local or global config, then prompts for the Telegram token, optional comma-separated user IDs allowed to DM the bot directly, optional comma-separated allowed group chat IDs, progress verbosity, log level, optional voice mode, and optional user-level login startup from the current project folder. At least one direct user ID or group chat ID is required. If a config already exists at the chosen location, setup shows current values and pressing Enter with no input keeps them; secret values are shown only as set. If voice mode is enabled and `ffmpeg` is missing, setup can try a detected installer and then waits while you install `ffmpeg` in another terminal before continuing. Choice prompts show all options in a highlighted list with arrow-key selection and Enter to confirm.

Allowed chat IDs let the gateway observe messages in those groups and decide whether they are addressed to the bot. To receive all group messages, make this bot a group admin or disable Group Privacy Mode in BotFather. To receive messages from other bots in groups, also enable Bot-to-Bot Communication Mode. Direct private messages are accepted only from configured `allowedUserIds`.

Config discovery order:

1. Project-local `./.opencode-remote/config.json` in the current working directory.
2. Global `~/.opencode-remote/config.json`.

Local project config is useful when different projects need different Telegram bots or overrides. Global config is useful for one machine-wide Telegram setup.

If no config exists, `opencode-remote run` and `opencode-remote start` run setup automatically before starting the gateway.

## Running

Run in the foreground:

```bash
cd /path/to/your/project
opencode-remote run
```

Run foreground and background commands from the target OpenCode project folder. By default, the gateway starts `opencode serve` from that folder and uses it as the project identity for persisted state. For local `opencode.apiUrl` values with a configured port, auto-start passes that port to `opencode serve`; if OpenCode is still unreachable after about 60 seconds, the command exits with an error.

Stop the foreground gateway with `Ctrl+C`.

Run in the background:

```bash
cd /path/to/your/project
opencode-remote start
```

Check background status:

```bash
opencode-remote status
```

Stop the background gateway:

```bash
opencode-remote stop
```

Enable user-level login startup for this project folder:

```bash
cd /path/to/your/project
opencode-remote startup enable
```

Check or disable login startup:

```bash
opencode-remote startup status
opencode-remote startup disable
```

Login startup is scoped to the selected config and current project folder. It creates a macOS LaunchAgent, Linux systemd user service, or Windows Scheduled Task that runs `opencode-remote start` when you log in.

## Configuration

The config file is JSON:

```json
{
  "schemaVersion": 2,
  "telegram": {
    "botToken": "123456:telegram-bot-token",
    "allowedUserIds": [123456789],
    "allowedChatIds": [-1001234567890]
  },
  "voice": {
    "enabled": false,
    "mode": "on",
    "captions": false,
    "voice": "en-US-AndrewNeural",
    "groqApiKey": null,
    "sttModel": "whisper-large-v3-turbo"
  },
  "progressVerbosity": "verbose",
  "logLevel": "info"
}
```

`telegram.botToken` is required. It is the token for the bot that receives Telegram messages.

`telegram.allowedUserIds` is optional when `telegram.allowedChatIds` is configured. It is an array of trusted human Telegram user IDs that may use the bot in private direct chats. Setup accepts values such as `123456789` or `123456789, 222333444`. Direct messages from other users and all private bot-to-bot messages are ignored.

`telegram.allowedChatIds` is optional when `telegram.allowedUserIds` is configured. It allows the gateway to observe every sender in those group chats, including humans and other bots, and then apply group routing settings before prompting OpenCode. Telegram group and supergroup IDs are usually negative, for example `-1001234567890`. Do not configure group IDs for groups whose members or admins you do not trust.

`opencode.apiUrl` controls the OpenCode server URL. It defaults to `http://localhost:4096`. When `opencode.autoStart=true` and this URL points to `localhost` or `127.0.0.1` with a port, the gateway starts `opencode serve --port <port>` so it waits on the same URL it configured.

`progressVerbosity` controls the startup default for the prompt activity message in private chats. Supported values are `off`, `new`, `all`, and `verbose`. The default is `verbose`. The Telegram `/progress` command can change this at runtime in private chats. Group chats always suppress the `Activity` message.

Group behavior is managed from a private DM with the bot using `/group`. The DM menu lists known allowed groups, including groups from `telegram.allowedChatIds` and groups the bot has seen. Only configured `allowedUserIds` can use this menu. Running `/group` inside a group replies with a short notice to configure the bot in DM instead. Custom trigger phrases are configured per group from this DM menu; they are plain text, case-insensitive, and match as bounded words or phrases anywhere in text, captions, and voice transcripts.

`voice` controls optional Telegram voice input and spoken replies. `mode="on"` sends voice-note replies only after voice prompts, `mode="all"` sends voice-note replies after text, photo, and voice prompts, and `mode="off"` disables voice. By default, successful voice-note replies are voice-only. Set `voice.captions=true` or use `/voice captions on` to include short assistant text as the voice caption, or send longer assistant text as a companion text message. If speech generation or sending fails, the bot falls back to text once. Voice mode requires `voice.groqApiKey` and local `ffmpeg` when enabled.

`logLevel` controls structured log verbosity. Supported values are `fatal`, `error`, `warn`, `info`, `debug`, `trace`, and `silent`. Use `debug` when diagnosing routing, prompt delivery, OpenCode startup, permission, media, voice, sticker, or state issues. Debug logs are structured and intentionally use safe diagnostic metadata such as message kinds, chat types, booleans, counts, modes, and lifecycle stages instead of message text, transcripts, bot tokens, raw Telegram IDs, raw provider payloads, local file paths, or API keys.

Set individual config values from the CLI:

```bash
opencode-remote config set voice.enabled true
opencode-remote config set voice.groqApiKey gsk_...
opencode-remote config set voice.mode all -g
opencode-remote config set voice.captions true
```

Clear generated voice files from the app-data cache:

```bash
opencode-remote cache clear
```

Keep `config.json` private because it contains your Telegram bot token. Project-local `.opencode-remote/` is ignored by git.

## Telegram Commands

The bot currently supports:

```text
/status    Show gateway and active session status
/new       Create and select a new OpenCode session
/sessions  List OpenCode sessions and select one with inline buttons
/stop      Request stop for the active OpenCode session
/progress  Open a tool-progress menu; direct modes still work
/voice     Open a voice settings menu; direct subcommands still work
/stickers  Open a saved sticker-pack menu; direct subcommands still work
/skills    Browse local OpenCode skills and create generated project skills
/group     Manage Telegram group behavior in a DM menu
/help      Show available commands
```

Bare configuration commands open inline-button menus for discoverability. Menu buttons open submenus, change settings, run actions, or start guided text input instead of only telling you which command to type. Direct command forms still work for fast use, including `/progress verbose`, `/voice list ua`, `/voice set <voiceShortName>`, `/stickers save`, `/stickers list`, and `/stickers forget <pack_name>`.

Any non-command text message from an authorized private Telegram user is sent to OpenCode as a prompt. In allowed group chats, messages are sent to OpenCode only when group routing settings identify them as addressed to the bot. Defaults are conservative: human senders can trigger replies by replying to the bot, mentioning the bot username, or starting text with the bot name. Per-group custom trigger phrases can also route text, captions, and voice transcripts when the phrase appears anywhere in the message. Other bots are remembered as passive context by default but do not trigger replies unless group settings are changed in the DM `/group` menu. If no active session is selected, the gateway creates one automatically.

Allowed group chats keep bounded in-memory recent context while the gateway process runs. When a group message is routed, the gateway sends OpenCode the addressed message plus a capped recent-context transcript. It does not persist group message text; memory is cleared on gateway restart and when the active OpenCode session changes. Passive stickers and photos are stored as lightweight metadata and are not downloaded for OpenCode unless routed. Group voice messages may be transcribed before routing when voice mode is enabled so the gateway can decide whether the transcript addresses the bot.

Telegram text, photo, album, voice, and sticker prompts include safe author context for OpenCode. Forwarded prompts prefer the original author when Telegram provides it. Messages sent by anonymous admins or on behalf of a chat/channel use the sender chat title or username when available. If Telegram hides or omits usable author data, the prompt falls back to the authorized Telegram user without exposing raw Telegram payloads or numeric IDs.

When a new OpenCode session starts, OpenCode Remote sends hidden gateway context with no assistant reply. This helps the agent understand that voice input may arrive as transcripts and that final text can be delivered as voice notes when voice mode is enabled.

When OpenCode requests permission during a prompt, the bot sends a text message with `Allow once`, `Always allow`, and `Deny` buttons. Permission prompts are always text, including when `/voice on` or `/voice all` would make normal assistant replies voice-only.

Telegram photo albums are handled as one OpenCode prompt when Telegram provides a shared `media_group_id`. The album caption becomes the prompt text. Separate text messages sent after an album are treated as separate prompts.

Telegram stickers are downloaded as visual prompt context for OpenCode. Static stickers are sent as WebP image attachments. Video stickers use `ffmpeg` to generate sampled preview sheets. Animated `.tgs` stickers use `lottie_convert.py` from python-lottie when it is available, with a source-file fallback if conversion is not installed. The gateway caches reusable sticker visuals under app-data cache storage, keyed by Telegram `file_unique_id` and safe visual metadata. When possible, cached sticker visuals are summarized into short saved-sticker descriptions so future sticker requests can use a compact text catalog instead of exposing cache paths or Telegram file identifiers.

Sticker pack commands:

```text
/stickers save
/stickers list
/stickers forget <pack_name>
```

Use `/stickers` to open the saved-pack menu. Use `/stickers save` as a reply to a sticker to save that sticker pack for future sticker replies. `/stickers list` shows saved packs. `/stickers forget <pack_name>` removes a saved pack and its cached sticker previews. Incoming stickers from unsaved packs may also show a `Save pack` button. Once packs are saved, asking the bot to send a sticker lets OpenCode request one through the gateway without exposing Telegram file identifiers to the model. Saved sticker data is non-secret Telegram file metadata; bot tokens, user IDs, chat IDs, and raw download URLs are not persisted.

OpenCode skill commands:

```text
/skills
/skills create
```

`/skills` lists local skills the gateway can discover from the current OpenCode project, including default `.opencode/skills`, configured `skills.paths` in OpenCode config, compatible `.claude/skills` and `.agents/skills` folders, and generated skills created by OpenCode Remote. Remote `skills.urls` are reported but not listed by the gateway yet. `/skills create`, the `New skill` menu button, or a private chat request such as "please create a skill" starts a guided flow that writes a project-local generated skill under `.opencode/skills/opencode-remote-generated/<skill-name>/SKILL.md` after preview and confirmation. Generated skills are user-owned project configuration; avoid putting secrets, numeric Telegram identifiers, private file locations, logs, API keys, or private config values in them. The npm package also includes sanitized bundled media/design skills and OpenCode Remote guidance skills under `bundled-skills/`; they are not auto-loaded into this repository's own development OpenCode config. Restart OpenCode if a new skill is not discovered immediately.

Voice commands:

```text
/voice status
/voice on
/voice off
/voice all
/voice captions [on|off]
/voice list <countryCode|locale> [page]
/voice set <voiceShortName>
/voice test
```

Use `/voice` to open the voice settings menu. The menu lists voice countries with pagination, then shows paginated clickable voice buttons for the selected country. Direct `/voice list` still requires a short country code such as `ua` or `us`, or a full locale such as `uk-UA`; page is optional. Short codes match Edge TTS country/region codes first and fall back to language codes when no matching region exists. `/voice on` transcribes Telegram voice messages with Groq Whisper and replies with a voice note only for voice prompts. `/voice all` sends voice notes for text, photo, and voice prompts. Successful voice-note replies are voice-only by default; `/voice captions on` includes short assistant text as the voice caption and sends longer assistant text as a companion text message. If speech generation or sending fails, the bot falls back to the text reply. Telegram voice notes are sent as OGG Opus files converted with `ffmpeg`.

## Troubleshooting

If startup fails with a configuration error, check the selected `.opencode-remote/config.json` and make sure `telegram.botToken` is non-empty and at least one of `telegram.allowedUserIds` or `telegram.allowedChatIds` contains a numeric ID.

If Telegram private messages from a human user appear to be ignored, confirm that `telegram.allowedUserIds` contains your Telegram user ID, not the bot ID or chat ID.

If group messages appear to be ignored, confirm that `telegram.allowedChatIds` contains the group chat ID and that the message addresses the bot under the current `/group` settings. To receive all messages in groups, this bot must be a group admin or Group Privacy Mode must be disabled in BotFather. To receive messages from other bots in groups, also enable Bot-to-Bot Communication Mode.

If startup fails because OpenCode is unreachable, make sure the OpenCode CLI is installed and available in `PATH`. With auto-start enabled, the gateway waits about 60 seconds for the configured OpenCode URL before exiting.

If background mode does not start, run `opencode-remote status`.

If `opencode-remote status` reports a stale PID file, run `opencode-remote stop` once to remove it.

If voice setup says `ffmpeg` is missing, let setup try the detected installer or install it in another terminal, then press Enter in setup to retry. If runtime startup says `ffmpeg` is missing, install it and restart:

```bash
brew install ffmpeg
sudo apt-get install -y ffmpeg
sudo dnf install -y ffmpeg
winget install Gyan.FFmpeg
```
