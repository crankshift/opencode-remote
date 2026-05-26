# Telegram Voice Mode Design

## Goal

Add opt-in Telegram voice input and voice replies to OpenCode Remote while keeping the gateway usable as a text-first bot when voice dependencies are missing or disabled.

## Decisions

- Voice mode is disabled by default.
- Voice settings are persisted in the selected JSON config file.
- `ffmpeg` is required only when `voice.enabled=true`.
- The gateway never auto-installs `ffmpeg`.
- Text replies are still sent when a voice note is also sent.
- Generated speech files are disposable cache under the platform app-data directory.
- Default tests mock Telegram, OpenCode, Groq, Edge TTS, and `ffmpeg`.

## Configuration

The config gains an optional `voice` object:

```json
{
  "voice": {
    "enabled": false,
    "mode": "on",
    "voice": "en-US-AndrewNeural",
    "groqApiKey": null,
    "sttModel": "whisper-large-v3-turbo"
  }
}
```

`mode` supports:

- `off`: voice input and replies are disabled.
- `on`: voice input is transcribed and replies to voice prompts include a voice note.
- `all`: all assistant replies include a voice note.

`run` and `start` fail fast when voice is enabled but `ffmpeg` is missing. If voice is disabled, missing `ffmpeg` is only reported by `/voice status`.

## Architecture

Voice behavior is split across focused modules.

```text
src/core/voice/voiceService.js       mode rules and orchestration
src/core/voice/groqTranscriber.js    Groq Whisper transcription wrapper
src/core/voice/edgeTts.js            Edge TTS voice list and synthesis wrapper
src/core/voice/audioConverter.js     ffmpeg availability and conversion wrapper
src/core/voice/cache.js              app-data voice cache paths and clearing
src/adapters/telegram/voice.js       Telegram voice file download/send helpers
src/config/writeConfig.js            safe JSON config mutation
```

Telegram wiring depends on a small voice service interface. Groq, Edge TTS, and `ffmpeg` details do not leak into `src/adapters/telegram/bot.js`.

## Telegram Commands

```text
/voice status
/voice on
/voice off
/voice all
/voice list <countryCode> [page]
/voice set <voiceShortName>
/voice test
```

- `/voice status` shows mode, selected voice, STT model, Groq key presence, `ffmpeg` availability, and cache directory.
- `/voice on` enables voice mode and speaks only after voice prompts.
- `/voice all` enables voice mode and speaks after all prompts.
- `/voice off` disables voice input and spoken replies.
- `/voice list` pages Edge TTS voices and requires a short country or language code such as `en` or `uk`; page is optional.
- `/voice set` validates and persists a selected Edge TTS voice short name.
- `/voice test` sends a short sample using the selected voice.

## Data Flow

Voice prompt:

```text
Telegram voice message
  -> adapter downloads the voice file
  -> Groq Whisper transcribes it
  -> transcription is sent to OpenCode as text
  -> text reply is sent to Telegram
  -> Edge TTS generates MP3 when mode requires speech
  -> ffmpeg converts MP3 to OGG Opus
  -> Telegram sends the OGG as a voice note
```

Text prompt in `/voice all`:

```text
Telegram text
  -> normal OpenCode prompt flow
  -> text reply is sent to Telegram
  -> Edge TTS generates MP3
  -> ffmpeg converts MP3 to OGG Opus
  -> Telegram sends a voice note
```

## Error Handling

- Missing `ffmpeg` with enabled voice fails startup with install examples for Homebrew, apt, dnf, and winget.
- Missing Groq API key prevents transcription and is shown in `/voice status`.
- TTS/conversion/send failures are logged and reported with safe short Telegram messages.
- Generated files remain disposable and can be removed with `opencode-remote cache clear`.

## Self-Review Notes

The design keeps voice provider dependencies outside Telegram command wiring, preserves text-first behavior when voice is disabled, and makes persisted voice changes explicit through JSON config mutation.
