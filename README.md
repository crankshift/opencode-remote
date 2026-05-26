# OpenCode Remote

OpenCode Remote lets you use OpenCode from Telegram. It runs on your machine, connects to your local or remote OpenCode server, and forwards messages from one authorized Telegram user to OpenCode sessions.

This is a Telegram MVP with text prompts, photo prompts, and opt-in voice input/replies. Model switching, permission callbacks, and multi-messenger support are not implemented yet.

See [Features](https://github.com/crankshift/opencode-remote/blob/main/FEATURES.md) for the full current capability list, [Changelog](https://github.com/crankshift/opencode-remote/blob/main/CHANGELOG.md) for release notes, and [TODO](https://github.com/crankshift/opencode-remote/blob/main/TODO.md) for planned work.

## Prerequisites

- Node.js 22.18.0 or newer. Node.js 24 LTS is recommended.
- OpenCode CLI available on the machine running the gateway.
- A Telegram bot token from BotFather.
- Your Telegram numeric user ID for the allowlist.
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

The setup flow asks whether to write a project-local or global config, then prompts for the Telegram token, allowed Telegram user ID, progress verbosity, log level, and optional voice mode. If a config already exists at the chosen location, setup shows current values and pressing Enter with no input keeps them; secret values are shown only as set. If voice mode is enabled and `ffmpeg` is missing, setup can try a detected installer and then waits while you install `ffmpeg` in another terminal before continuing. Choice prompts show all options in a highlighted list with arrow-key selection and Enter to confirm.

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

Run foreground and background commands from the target OpenCode project folder. By default, the gateway starts `opencode serve` from that folder and uses it as the project identity for persisted state.

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

## Configuration

The config file is JSON:

```json
{
  "telegram": {
    "botToken": "123456:telegram-bot-token",
    "allowedUserId": 123456789
  },
  "voice": {
    "enabled": false,
    "mode": "on",
    "voice": "en-US-AndrewNeural",
    "groqApiKey": null,
    "sttModel": "whisper-large-v3-turbo"
  },
  "progressVerbosity": "verbose",
  "logLevel": "info"
}
```

`telegram.botToken` is required. It is the token for the bot that receives Telegram messages.

`telegram.allowedUserId` is required. Updates from other Telegram users are ignored.

`progressVerbosity` controls the startup default for the prompt activity message. Supported values are `off`, `new`, `all`, and `verbose`. The default is `verbose`. The Telegram `/progress` command can change this at runtime.

`voice` controls optional Telegram voice input and spoken replies. `mode="on"` speaks only after voice prompts, `mode="all"` speaks after all prompts, and `mode="off"` disables voice. Voice mode requires `voice.groqApiKey` and local `ffmpeg` when enabled.

`logLevel` controls structured log verbosity. Supported values are `fatal`, `error`, `warn`, `info`, `debug`, `trace`, and `silent`.

Set individual config values from the CLI:

```bash
opencode-remote config set voice.enabled true
opencode-remote config set voice.groqApiKey gsk_...
opencode-remote config set voice.mode all -g
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
/progress  Show or set tool progress visibility: off, new, all, verbose
/voice     Show or set voice mode
/help      Show available commands
```

Any non-command text message from the authorized Telegram user is sent to OpenCode as a prompt. If no active session is selected, the gateway creates one automatically.

Telegram photo albums are handled as one OpenCode prompt when Telegram provides a shared `media_group_id`. The album caption becomes the prompt text. Separate text messages sent after an album are treated as separate prompts.

Voice commands:

```text
/voice status
/voice on
/voice off
/voice all
/voice list [locale] [gender] [page]
/voice set <voiceShortName>
/voice test
```

`/voice on` transcribes Telegram voice messages with Groq Whisper and replies with a voice note only for voice prompts. `/voice all` also sends voice notes for text/photo replies. Telegram voice notes are sent as OGG Opus files converted with `ffmpeg`.

## Troubleshooting

If startup fails with a configuration error, check the selected `.opencode-remote/config.json` and make sure `telegram.botToken` is non-empty and `telegram.allowedUserId` is numeric.

If Telegram messages appear to be ignored, confirm that `telegram.allowedUserId` matches your Telegram user ID, not the bot ID or chat ID.

If startup fails because OpenCode is unreachable, make sure the OpenCode CLI is installed and available in `PATH`.

If background mode does not start, run `opencode-remote status`.

If `opencode-remote status` reports a stale PID file, run `opencode-remote stop` once to remove it.

If voice setup says `ffmpeg` is missing, let setup try the detected installer or install it in another terminal, then press Enter in setup to retry. If runtime startup says `ffmpeg` is missing, install it and restart:

```bash
brew install ffmpeg
sudo apt install ffmpeg
sudo dnf install ffmpeg
winget install Gyan.FFmpeg
```
