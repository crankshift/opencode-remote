# OpenCode Remote

OpenCode Remote lets you use OpenCode from Telegram. It runs on your machine, connects to your local or remote OpenCode server, and forwards messages from one authorized Telegram user to OpenCode sessions.

This is a Telegram MVP with text prompts, photo prompts, OpenCode permission approvals, and opt-in voice input/replies. Model switching and multi-messenger support are not implemented yet.

See [Features](https://github.com/crankshift/opencode-remote/blob/main/FEATURES.md) for the full current capability list, [Contributing](https://github.com/crankshift/opencode-remote/blob/main/CONTRIBUTING.md) for contribution guidance, [Changelog](https://github.com/crankshift/opencode-remote/blob/main/CHANGELOG.md) for release notes, and [TODO](https://github.com/crankshift/opencode-remote/blob/main/TODO.md) for planned work.

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

The setup flow asks whether to write a project-local or global config, then prompts for the Telegram token, allowed Telegram user ID, progress verbosity, log level, optional voice mode, and optional user-level login startup from the current project folder. If a config already exists at the chosen location, setup shows current values and pressing Enter with no input keeps them; secret values are shown only as set. If voice mode is enabled and `ffmpeg` is missing, setup can try a detected installer and then waits while you install `ffmpeg` in another terminal before continuing. Choice prompts show all options in a highlighted list with arrow-key selection and Enter to confirm.

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

`opencode.apiUrl` controls the OpenCode server URL. It defaults to `http://localhost:4096`. When `opencode.autoStart=true` and this URL points to `localhost` or a loopback IP with a port, the gateway starts `opencode serve --port <port>` so it waits on the same URL it configured.

`progressVerbosity` controls the startup default for the prompt activity message. Supported values are `off`, `new`, `all`, and `verbose`. The default is `verbose`. The Telegram `/progress` command can change this at runtime.

`voice` controls optional Telegram voice input and spoken replies. `mode="on"` sends voice-note replies only after voice prompts, `mode="all"` sends voice-note replies after text, photo, and voice prompts, and `mode="off"` disables voice. When a voice-note reply succeeds, the bot does not also send the text reply; if speech generation or sending fails, it falls back to text. Voice mode requires `voice.groqApiKey` and local `ffmpeg` when enabled.

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

When a new OpenCode session starts, OpenCode Remote sends hidden gateway context with no assistant reply. This helps the agent understand that voice input may arrive as transcripts and that final text can be delivered as voice notes when voice mode is enabled.

When OpenCode requests permission during a prompt, the bot sends a text message with `Allow once`, `Always allow`, and `Deny` buttons. Permission prompts are always text, including when `/voice on` or `/voice all` would make normal assistant replies voice-only.

Telegram photo albums are handled as one OpenCode prompt when Telegram provides a shared `media_group_id`. The album caption becomes the prompt text. Separate text messages sent after an album are treated as separate prompts.

Voice commands:

```text
/voice status
/voice on
/voice off
/voice all
/voice list <countryCode|locale> [page]
/voice set <voiceShortName>
/voice test
```

`/voice list` requires a short country code such as `ua` or `us`, or a full locale such as `uk-UA`; page is optional. Short codes match Edge TTS country/region codes first and fall back to language codes when no matching region exists. `/voice on` transcribes Telegram voice messages with Groq Whisper and replies with a voice note only for voice prompts. `/voice all` sends voice notes for text, photo, and voice prompts. Successful voice-note replies are voice-only; if speech generation or sending fails, the bot falls back to the text reply. Telegram voice notes are sent as OGG Opus files converted with `ffmpeg`.

## Troubleshooting

If startup fails with a configuration error, check the selected `.opencode-remote/config.json` and make sure `telegram.botToken` is non-empty and `telegram.allowedUserId` is numeric.

If Telegram messages appear to be ignored, confirm that `telegram.allowedUserId` matches your Telegram user ID, not the bot ID or chat ID.

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
