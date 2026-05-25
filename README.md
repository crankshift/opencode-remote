# OpenCode Remote

OpenCode Remote lets you use OpenCode from Telegram. It runs on your machine, connects to your local or remote OpenCode server, and forwards messages from one authorized Telegram user to OpenCode sessions.

This is a text-first Telegram MVP. Voice input, voice replies, model switching, permission callbacks, and multi-messenger support are not implemented yet.

See [Features](https://github.com/crankshift/opencode-remote/blob/main/FEATURES.md) for the full current capability list, [Changelog](https://github.com/crankshift/opencode-remote/blob/main/CHANGELOG.md) for release notes, and [TODO](https://github.com/crankshift/opencode-remote/blob/main/TODO.md) for planned work.

## Prerequisites

- Node.js 22.18.0 or newer. Node.js 24 LTS is recommended.
- OpenCode CLI available on the machine running the gateway.
- A Telegram bot token from BotFather.
- Your Telegram numeric user ID for the allowlist.

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

## Setup

Create the config interactively:

```bash
opencode-remote setup
```

The setup flow asks whether to write a project-local or global config, then prompts for the Telegram token, allowed Telegram user ID, OpenCode connection settings, progress verbosity, log level, and settings path.

Config discovery order:

1. Project-local `./.opencode-remote/config.json` in the current working directory.
2. Global `~/.opencode-remote/config.json`.

Local project config is useful when different projects need different OpenCode workdirs or Telegram bots. Global config is useful for one machine-wide gateway setup.

If no config exists, `opencode-remote run` and `opencode-remote start` run setup automatically before starting the gateway.

## Running

Run in the foreground:

```bash
opencode-remote run
```

Stop the foreground gateway with `Ctrl+C`.

Run in the background:

```bash
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

Background mode writes runtime files beside the selected config:

- `.opencode-remote/gateway.pid` stores the background process ID.
- `.opencode-remote/gateway.log` stores background stdout and stderr.

On startup, the gateway checks `opencode.apiUrl`. If it is reachable, the gateway uses that server. If it is not reachable and `opencode.autoStart=true`, the gateway starts `opencode.command serve` and waits for it to become reachable before starting Telegram polling. Before polling starts, the gateway refreshes Telegram's slash-command menu for default and private chats.

If the gateway started the OpenCode child process, it stops that child during shutdown. It does not stop an OpenCode server that was already running.

## Configuration

The config file is JSON:

```json
{
  "telegram": {
    "botToken": "123456:telegram-bot-token",
    "allowedUserId": 123456789
  },
  "opencode": {
    "apiUrl": "http://localhost:4096",
    "command": "opencode",
    "autoStart": true,
    "workdir": null
  },
  "progressVerbosity": "all",
  "logLevel": "info"
}
```

`telegram.botToken` is required. It is the token for the bot that receives Telegram messages.

`telegram.allowedUserId` is required. Updates from other Telegram users are ignored.

`opencode.apiUrl` is the OpenCode server URL. The default is `http://localhost:4096`.

`opencode.command` is the executable used when the gateway starts OpenCode itself. The default is `opencode`.

`opencode.autoStart` controls whether the gateway starts `opencode serve` if `opencode.apiUrl` is not reachable. Set it to `false` if you want to manage the OpenCode server yourself.

`opencode.workdir` is the working directory used when auto-starting OpenCode. If omitted or `null`, the gateway uses the current process directory.

`progressVerbosity` controls the startup default for the prompt activity message. Supported values are `off`, `new`, `all`, and `verbose`. The default is `all`, which shows every distinct tool or skill invocation. The Telegram `/progress` command can change this at runtime and persists the selected value in the settings file.

`logLevel` controls structured log verbosity. Supported values are `fatal`, `error`, `warn`, `info`, `debug`, `trace`, and `silent`.

`settingsPath` is optional. If omitted, gateway state is stored beside the selected config as `.opencode-remote/settings.json`. Do not store secrets in the settings file.

Keep `config.json` private because it contains your Telegram bot token. Project-local `.opencode-remote/` is ignored by git.

## Telegram Commands

The bot currently supports:

```text
/status    Show gateway and active session status
/new       Create and select a new OpenCode session
/sessions  List OpenCode sessions and select one with inline buttons
/stop      Request stop for the active OpenCode session
/progress  Show or set tool progress visibility: off, new, all, verbose
/help      Show available commands
```

Any non-command text message from the authorized Telegram user is sent to OpenCode as a prompt. If no active session is selected, the gateway creates one automatically.

Telegram photo albums are handled as one OpenCode prompt when Telegram provides a shared `media_group_id`. The album caption becomes the prompt text. Separate text messages sent after an album are treated as separate prompts.

## Troubleshooting

If startup fails with a configuration error, check the selected `.opencode-remote/config.json` and make sure `telegram.botToken` is non-empty and `telegram.allowedUserId` is numeric.

If Telegram messages appear to be ignored, confirm that `telegram.allowedUserId` matches your Telegram user ID, not the bot ID or chat ID.

If startup fails because OpenCode is unreachable, either start OpenCode yourself at `opencode.apiUrl` or set `opencode.autoStart=true` and make sure `opencode.command` is available in `PATH`.

If auto-start fails, check `opencode.workdir`. The gateway starts `opencode serve` from that directory, or from the current process directory when `opencode.workdir` is empty.

If background mode does not start, run `opencode-remote status` and inspect `.opencode-remote/gateway.log` beside the selected config.

If `opencode-remote status` reports a stale PID file, run `opencode-remote stop` once to remove it.

If session selection is not preserved, check that the parent directory for the settings file is writable. The default path is `.opencode-remote/settings.json` beside the selected config.
